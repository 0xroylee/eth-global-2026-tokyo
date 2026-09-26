// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BossCollectibles} from "./BossCollectibles.sol";
import {IBossRouterContext} from "./interfaces/IBossRouterContext.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {BossPricing} from "./libraries/BossPricing.sol";

/// @notice Canonical Boss Pool rules, attack accounting, prize escrow and claim custody.
contract BossHook is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    enum RoundStatus {
        Setup,
        Active,
        StageCleared,
        Defeated,
        Expired
    }

    struct RoundConfig {
        uint256 prizeAmount;
        uint256 deadline;
        uint256 stageOneHP;
        int24 hpPriceTick;
        bool externalHP;
        bool prizeInHP;
        uint256 volumeTargetMockUSD;
        uint256 saleHPBudget;
        uint256 maxRoyPerMockUSDX128;
    }

    uint8 private constant MODE_SETUP = 2;
    uint8 private constant MODE_ATTACK = 3;
    uint8 private constant MODE_TRANSITION = 4;
    uint8 private constant MODE_QUOTE = 5;
    uint24 public constant SWAP_FEE = 3_000;
    int24 public constant TICK_SPACING = 60;
    int24 public immutable LOWER_TICK;
    int24 public immutable UPPER_TICK;
    uint256 private constant FEE_DENOMINATOR = 1_000_000;

    IPoolManager public immutable manager;
    IBossRouterContext public immutable router;
    IERC20 public immutable mockUSD;
    IERC20 public immutable roy;
    IERC20 public immutable bossHP;
    IERC20 public immutable rewardToken;
    BossCollectibles public immutable collectibles;
    address public immutable maker;
    /// @notice Zero for perpetual Factory bosses; standalone rounds retain their fixed deadline.
    uint256 public immutable deadline;
    uint160 public immutable sqrtLowerX96;
    uint160 public immutable sqrtUpperX96;
    bool public immutable bossIsCurrency0;
    bool public immutable externalHP;
    uint256 public immutable volumeTargetMockUSD;
    uint256 public immutable saleHPBudget;
    uint256 public immutable maxRoyPerMockUSDX128;

    uint256 public originalPrize;
    uint256 public finalEligibleHP;
    uint256 public redeemedHP;
    uint256 public paidPrize;
    bool public prizeFunded;
    bool public expiredPrizeRefunded;
    bool public poolInitialized;
    bool public victoryNFTClaimedAny;
    RoundStatus public status;
    uint8 public currentStage;
    uint160 public lastSqrtPriceX96;
    PoolId private _bossPoolId;
    PoolKey private _bossPoolKey;

    mapping(uint8 stage => uint256) public stageSold;
    mapping(uint8 stage => uint256) public stageCapacity;
    mapping(uint8 stage => uint128) public stageLiquidity;
    mapping(uint8 stage => uint256) public stageAttackCount;
    mapping(uint8 stage => uint256) public stageVolumeTarget;
    mapping(uint8 stage => uint256) public stageVolume;
    mapping(uint8 stage => uint256) public roundingDust;
    mapping(uint8 stage => uint160) public stageEndSqrtPriceX96;
    mapping(address player => bool) public hasAttacked;
    mapping(address player => bool) public victoryClaimed;
    /// @notice External-token prize credit belongs to the attacker, independently of token ownership.
    mapping(address player => uint256) public rewardCredit;
    uint256 public totalVolume;
    uint256 public eligibleHP;

    error Unauthorized();
    error InvalidRound();
    error InvalidPool();
    error InvalidHookContext();
    error InvalidStage();
    error InvalidPosition();
    error InvalidSwap();
    error NoDamage();
    error PrizeNotFunded();
    error ClaimUnavailable();
    error LiquidityRemovalDisabled();

    event PrizeFunded(address indexed maker, uint256 amount);
    event StageActivated(uint8 indexed stage, uint160 sqrtPriceX96, uint128 liquidity, uint256 capacity);
    event AttackRecorded(address indexed player, uint8 indexed stage, uint256 bossHPOut, uint256 cumulativeSold);
    event VolumeCredited(address indexed player, uint8 indexed stage, uint256 mockUSD, uint256 totalMockUSD);
    event StageCleared(uint8 indexed stage, uint256 sold, uint256 capacity, uint256 roundingDust);
    event BossDefeated(uint256 finalEligibleHP, uint256 originalPrize);
    event RewardClaimed(address indexed player, uint256 rewardCreditUsed, uint256 memeTokenPrize);
    event VictoryNFTClaimed(address indexed player, uint256 tokenId);
    event RoundExpired(uint256 timestamp);
    event ExpiredPrizeRefunded(address indexed maker, uint256 amount);

    constructor(
        IPoolManager manager_,
        IBossRouterContext router_,
        IERC20 mockUSD_,
        IERC20 roy_,
        IERC20 bossHP_,
        BossCollectibles collectibles_,
        address maker_,
        RoundConfig memory config
    ) {
        if (
            address(manager_) == address(0) || address(router_) == address(0) || address(mockUSD_) == address(0)
                || address(roy_) == address(0) || address(bossHP_) == address(0)
                || address(collectibles_) == address(0) || maker_ == address(0) || config.prizeAmount == 0
                || (config.volumeTargetMockUSD == 0 ? config.deadline <= block.timestamp : config.deadline != 0)
                || config.stageOneHP == 0
                || config.stageOneHP > uint256(uint128(type(int128).max)) / 6
                || config.hpPriceTick % TICK_SPACING != 0
                || config.hpPriceTick < -887_220 || config.hpPriceTick > 885_300
                || address(mockUSD_) == address(roy_) || address(mockUSD_) == address(bossHP_)
                || address(roy_) == address(bossHP_)
                || (config.prizeInHP && !config.externalHP)
                || (config.volumeTargetMockUSD != 0
                    && (!config.externalHP || !config.prizeInHP || config.saleHPBudget == 0
                        || config.maxRoyPerMockUSDX128 == 0 || config.volumeTargetMockUSD < 6
                        || config.stageOneHP != config.saleHPBudget / 6
                        || config.saleHPBudget != config.stageOneHP * 6))
        ) revert InvalidRound();

        manager = manager_;
        router = router_;
        mockUSD = mockUSD_;
        roy = roy_;
        bossHP = bossHP_;
        rewardToken = config.prizeInHP ? bossHP_ : mockUSD_;
        collectibles = collectibles_;
        maker = maker_;
        originalPrize = config.prizeAmount;
        deadline = config.deadline;
        externalHP = config.externalHP;
        volumeTargetMockUSD = config.volumeTargetMockUSD;
        saleHPBudget = config.saleHPBudget;
        maxRoyPerMockUSDX128 = config.maxRoyPerMockUSDX128;
        stageVolumeTarget[0] = config.volumeTargetMockUSD / 6;
        stageVolumeTarget[1] = config.volumeTargetMockUSD / 3;
        stageVolumeTarget[2] = config.volumeTargetMockUSD - stageVolumeTarget[0] - stageVolumeTarget[1];
        status = RoundStatus.Setup;

        Currency bossCurrency = Currency.wrap(address(bossHP_));
        Currency royCurrency = Currency.wrap(address(roy_));
        bossIsCurrency0 = Currency.unwrap(bossCurrency) < Currency.unwrap(royCurrency);
        Currency currency0 = bossIsCurrency0 ? bossCurrency : royCurrency;
        Currency currency1 = bossIsCurrency0 ? royCurrency : bossCurrency;
        _bossPoolKey = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: SWAP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(this))
        });
        LOWER_TICK = bossIsCurrency0 ? config.hpPriceTick : -(config.hpPriceTick + 1_920);
        UPPER_TICK = bossIsCurrency0 ? config.hpPriceTick + 1_920 : -config.hpPriceTick;
        sqrtLowerX96 = TickMath.getSqrtPriceAtTick(LOWER_TICK);
        sqrtUpperX96 = TickMath.getSqrtPriceAtTick(UPPER_TICK);

        uint128 previousLiquidity;
        for (uint8 stage = 0; stage < 3; stage++) {
            uint256 nominalHP = config.stageOneHP * (stage + 1);
            uint128 targetLiquidity =
                BossPricing.liquidityForHP(nominalHP, sqrtLowerX96, sqrtUpperX96, bossIsCurrency0);
            if (targetLiquidity <= previousLiquidity) revert InvalidStage();
            uint256 capacity = _capacityForLiquidity(targetLiquidity);
            if (capacity < nominalHP || capacity > nominalHP + 1) revert InvalidStage();
            stageLiquidity[stage] = targetLiquidity;
            stageCapacity[stage] = capacity;
            previousLiquidity = targetLiquidity;
        }

        Hooks.validateHookPermissions(
            IHooks(address(this)),
            Hooks.Permissions({
                beforeInitialize: true,
                afterInitialize: false,
                beforeAddLiquidity: true,
                afterAddLiquidity: false,
                beforeRemoveLiquidity: true,
                afterRemoveLiquidity: false,
                beforeSwap: true,
                afterSwap: true,
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            })
        );
    }

    function bossPoolKey() external view returns (PoolKey memory) {
        return _bossPoolKey;
    }

    function bossPoolId() external view returns (bytes32) {
        return PoolId.unwrap(_bossPoolId);
    }

    function _expired() private view returns (bool) {
        return deadline != 0 && block.timestamp >= deadline;
    }

    function fundPrize() external nonReentrant {
        if (status != RoundStatus.Setup || prizeFunded || _expired()) revert InvalidRound();
        prizeFunded = true;
        if (externalHP) {
            if (rewardToken.balanceOf(address(this)) < originalPrize) revert PrizeNotFunded();
        } else {
            uint256 balanceBefore = rewardToken.balanceOf(address(this));
            rewardToken.safeTransferFrom(msg.sender, address(this), originalPrize);
            if (rewardToken.balanceOf(address(this)) - balanceBefore != originalPrize) revert PrizeNotFunded();
        }
        emit PrizeFunded(maker, originalPrize);
    }

    function activateFromRouter() external {
        if (msg.sender != address(router)) revert Unauthorized();
        if (
            status != RoundStatus.Setup || _expired() || router.mode() != MODE_SETUP
                || !prizeFunded || !poolInitialized
        ) {
            revert InvalidRound();
        }
        _assertRegisteredPositions(0);
        (uint160 price,,uint24 protocolFee,uint24 lpFee) = manager.getSlot0(_bossPoolId);
        uint160 expectedStart = bossIsCurrency0 ? sqrtLowerX96 : sqrtUpperX96;
        if (price != expectedStart || protocolFee != 0 || lpFee != SWAP_FEE) revert InvalidPool();
        if (_remainingSellableHP(price, stageLiquidity[0]) == 0) revert InvalidStage();
        lastSqrtPriceX96 = price;
        status = RoundStatus.Active;
        emit StageActivated(0, price, stageLiquidity[0], stageCapacity[0]);
    }

    function completeStageTransition(uint8 nextStage) external {
        if (msg.sender != address(router)) revert Unauthorized();
        if (
            status != RoundStatus.StageCleared || router.mode() != MODE_TRANSITION
                || nextStage != currentStage + 1 || nextStage > 2 || router.pendingStage() != nextStage
                || router.expectedStage() != currentStage || router.activePlayer() != address(0)
        ) revert InvalidHookContext();

        _assertRegisteredPositions(nextStage);
        (uint160 price,,,) = manager.getSlot0(_bossPoolId);
        uint160 resetPrice = bossIsCurrency0 ? sqrtLowerX96 : sqrtUpperX96;
        if (price != resetPrice) revert InvalidPool();
        if (_remainingSellableHP(price, stageLiquidity[nextStage]) == 0) revert InvalidStage();

        currentStage = nextStage;
        lastSqrtPriceX96 = price;
        status = RoundStatus.Active;
        emit StageActivated(nextStage, price, stageLiquidity[nextStage], stageCapacity[nextStage]);
    }

    function remainingStageVolume() external view returns (uint256) {
        if (volumeTargetMockUSD == 0 || status != RoundStatus.Active) revert InvalidStage();
        return stageVolumeTarget[currentStage] - stageVolume[currentStage];
    }

    function beforeInitialize(address sender, PoolKey calldata key, uint160) external returns (bytes4) {
        if (
            msg.sender != address(manager) || sender != address(router) || router.mode() != MODE_SETUP
                || _expired()
        ) {
            revert InvalidHookContext();
        }
        if (
            Currency.unwrap(key.currency0) != Currency.unwrap(_bossPoolKey.currency0)
                || Currency.unwrap(key.currency1) != Currency.unwrap(_bossPoolKey.currency1)
                || key.fee != SWAP_FEE || key.tickSpacing != TICK_SPACING || key.hooks != IHooks(address(this))
                || poolInitialized
        ) revert InvalidPool();
        _bossPoolId = key.toId();
        poolInitialized = true;
        return IHooks.beforeInitialize.selector;
    }

    function beforeAddLiquidity(
        address sender,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata
    ) external view returns (bytes4) {
        _authenticatePoolCallback(sender, key);
        if (sender != address(router) || params.tickLower != LOWER_TICK || params.tickUpper != UPPER_TICK) {
            revert InvalidHookContext();
        }
        if (params.liquidityDelta <= 0) revert InvalidPosition();

        uint8 stage;
        uint128 expectedDelta;
        if (router.mode() == MODE_SETUP) {
            if (status != RoundStatus.Setup || currentStage != 0 || _expired()) {
                revert InvalidHookContext();
            }
            stage = 0;
            expectedDelta = stageLiquidity[0];
        } else if (router.mode() == MODE_TRANSITION) {
            stage = router.pendingStage();
            if (
                status != RoundStatus.StageCleared || stage != currentStage + 1 || stage > 2
                    || router.expectedStage() != currentStage || router.activePlayer() != address(0)
            ) revert InvalidHookContext();
            expectedDelta = stageLiquidity[stage] - stageLiquidity[currentStage];
        } else {
            revert InvalidHookContext();
        }
        if (uint256(params.liquidityDelta) != uint256(expectedDelta) || params.salt != bytes32(uint256(stage + 1))) {
            revert InvalidPosition();
        }
        return IHooks.beforeAddLiquidity.selector;
    }

    /// @notice Creator liquidity is permanently locked, including after victory.
    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external pure returns (bytes4)
    {
        revert LiquidityRemovalDisabled();
    }

    function beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        view
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        _authenticatePoolCallback(sender, key);
        if (sender != address(router) || params.amountSpecified >= 0) revert InvalidSwap();
        (uint160 price,,uint24 protocolFee,uint24 lpFee) = manager.getSlot0(_bossPoolId);
        if (price < sqrtLowerX96 || price > sqrtUpperX96) revert InvalidPool();
        if (protocolFee != 0 || lpFee != SWAP_FEE) revert InvalidPool();

        uint8 operation = router.mode();
        if (operation == MODE_ATTACK || operation == MODE_QUOTE) {
            if (
                status != RoundStatus.Active || _expired() || router.activePlayer() == address(0)
                    || router.expectedStage() != currentStage || params.zeroForOne == bossIsCurrency0
                    || params.sqrtPriceLimitX96 != (bossIsCurrency0 ? sqrtUpperX96 : sqrtLowerX96)
            ) revert InvalidSwap();
            _assertRegisteredPositions(currentStage);
        } else if (router.mode() == MODE_TRANSITION) {
            if (
                status != RoundStatus.StageCleared || router.activePlayer() != address(0)
                    || router.expectedStage() != currentStage
                    || params.zeroForOne != bossIsCurrency0
                    || params.sqrtPriceLimitX96 != (bossIsCurrency0 ? sqrtLowerX96 : sqrtUpperX96)
            ) revert InvalidSwap();
            _assertRegisteredPositions(currentStage);
            uint256 maxRefillInput = _refillInput(price, stageLiquidity[currentStage]);
            if (uint256(-params.amountSpecified) != maxRefillInput) revert InvalidSwap();
        } else {
            revert InvalidHookContext();
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function afterSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) external returns (bytes4, int128) {
        _authenticatePoolCallback(sender, key);
        if (sender != address(router)) revert InvalidHookContext();

        (uint160 price,,,) = manager.getSlot0(_bossPoolId);
        if (router.mode() == MODE_TRANSITION) {
            if (status != RoundStatus.StageCleared || params.zeroForOne != bossIsCurrency0) {
                revert InvalidHookContext();
            }
            if (bossIsCurrency0 ? price > lastSqrtPriceX96 : price < lastSqrtPriceX96) revert InvalidPool();
            lastSqrtPriceX96 = price;
            return (IHooks.afterSwap.selector, 0);
        }

        uint8 operation = router.mode();
        if (
            (operation != MODE_ATTACK && operation != MODE_QUOTE) || status != RoundStatus.Active
                || params.zeroForOne == bossIsCurrency0
                || router.expectedStage() != currentStage
        ) revert InvalidHookContext();
        if (bossIsCurrency0 ? price < lastSqrtPriceX96 : price > lastSqrtPriceX96) revert InvalidPool();

        int128 rawOutput = bossIsCurrency0 ? delta.amount0() : delta.amount1();
        if (rawOutput <= 0) revert NoDamage();
        uint256 hpOut = uint256(uint128(rawOutput));
        uint8 stage = currentStage;
        uint256 newSold = stageSold[stage] + hpOut;
        if (newSold > stageCapacity[stage]) revert InvalidSwap();
        uint256 newEligibleHP = eligibleHP + hpOut;
        uint256 creditedVolume;
        uint256 nextVolume;
        if (volumeTargetMockUSD != 0) {
            uint256 usdSpent = router.activeMockUSDSpent();
            uint256 royBought = router.activeRoyBought();
            if (usdSpent == 0 || royBought == 0) revert InvalidSwap();
            if (FullMath.mulDiv(royBought, 1 << 128, usdSpent) > maxRoyPerMockUSDX128) {
                revert InvalidSwap();
            }
            creditedVolume = FullMath.mulDiv(usdSpent, _inputAmount(delta, params.zeroForOne), royBought);
            if (creditedVolume == 0) revert InvalidSwap();
            nextVolume = totalVolume + creditedVolume;
            if (newEligibleHP > FullMath.mulDiv(saleHPBudget, nextVolume, volumeTargetMockUSD)) {
                revert InvalidSwap();
            }
        }
        stageSold[stage] = newSold;
        eligibleHP = newEligibleHP;
        stageAttackCount[stage]++;
        hasAttacked[router.activePlayer()] = true;
        if (externalHP) rewardCredit[router.activePlayer()] += hpOut;
        lastSqrtPriceX96 = price;
        emit AttackRecorded(router.activePlayer(), stage, hpOut, newSold);

        uint256 remaining = _remainingSellableHP(price, stageLiquidity[stage]);
        if (volumeTargetMockUSD != 0) {
            stageVolume[stage] += creditedVolume;
            totalVolume = nextVolume;
            emit VolumeCredited(router.activePlayer(), stage, creditedVolume, totalVolume);
            if (stageVolume[stage] >= stageVolumeTarget[stage]) _clearVolumeStage(stage);
        } else if (remaining == 0) {
            _clearStage(stage);
        }
        return (IHooks.afterSwap.selector, 0);
    }

    function claimReward(uint256 hpAmount) external nonReentrant returns (uint256 payout) {
        if (status != RoundStatus.Defeated || hpAmount == 0 || redeemedHP + hpAmount > finalEligibleHP) {
            revert ClaimUnavailable();
        }
        payout = Math.mulDiv(originalPrize, hpAmount, finalEligibleHP);
        if (payout == 0) revert ClaimUnavailable();
        if (externalHP) {
            if (hpAmount > rewardCredit[msg.sender]) revert ClaimUnavailable();
            rewardCredit[msg.sender] -= hpAmount;
        }

        redeemedHP += hpAmount;
        paidPrize += payout;
        if (!externalHP) {
            uint256 balanceBefore = bossHP.balanceOf(address(this));
            bossHP.safeTransferFrom(msg.sender, address(this), hpAmount);
            if (bossHP.balanceOf(address(this)) - balanceBefore != hpAmount) revert ClaimUnavailable();
        }
        rewardToken.safeTransfer(msg.sender, payout);
        emit RewardClaimed(msg.sender, hpAmount, payout);
    }

    function claimVictoryNFT() external nonReentrant returns (uint256 tokenId) {
        if (status != RoundStatus.Defeated || !hasAttacked[msg.sender] || victoryClaimed[msg.sender]) {
            revert ClaimUnavailable();
        }
        victoryClaimed[msg.sender] = true;
        tokenId = collectibles.mintVictory(msg.sender);
        emit VictoryNFTClaimed(msg.sender, tokenId);
    }

    function expire() external {
        if (
            deadline == 0 || (status != RoundStatus.Active && status != RoundStatus.StageCleared)
                || block.timestamp < deadline
        ) revert InvalidRound();
        status = RoundStatus.Expired;
        emit RoundExpired(block.timestamp);
    }

    function refundExpiredPrize() external nonReentrant {
        if (
            msg.sender != maker || status != RoundStatus.Expired || expiredPrizeRefunded
        ) revert Unauthorized();
        expiredPrizeRefunded = true;
        rewardToken.safeTransfer(maker, originalPrize);
        emit ExpiredPrizeRefunded(maker, originalPrize);
    }

    function remainingSellableHP() external view returns (uint256) {
        if (!poolInitialized || status == RoundStatus.Defeated || status == RoundStatus.Expired) return 0;
        (uint160 price,,,) = manager.getSlot0(_bossPoolId);
        return _remainingSellableHP(price, stageLiquidity[currentStage]);
    }

    function currentRefillInput() external view returns (uint256) {
        if (status != RoundStatus.StageCleared || !poolInitialized) revert InvalidStage();
        (uint160 price,,,) = manager.getSlot0(_bossPoolId);
        return _refillInput(price, stageLiquidity[currentStage]);
    }

    function stageRefillRequirement(uint8 stage) external view returns (uint256) {
        if (stage >= 2) revert InvalidStage();
        uint160 terminalPrice = bossIsCurrency0 ? sqrtUpperX96 : sqrtLowerX96;
        return _refillInput(terminalPrice, stageLiquidity[stage]);
    }

    function stageLiquidityDeposit(uint8 stage) external view returns (uint256) {
        if (stage > 2) revert InvalidStage();
        uint128 previous = stage == 0 ? 0 : stageLiquidity[stage - 1];
        return _capacityForLiquidity(stageLiquidity[stage] - previous);
    }

    function minimumRoyForVictoryPath() external view returns (uint256 total) {
        for (uint8 stage = 0; stage < 3; stage++) {
            total += _stageRoyInputRequirement(stage);
        }
    }

    function stageRoyInputRequirement(uint8 stage) external view returns (uint256) {
        if (stage > 2) revert InvalidStage();
        return _stageRoyInputRequirement(stage);
    }

    function _authenticatePoolCallback(address sender, PoolKey calldata key) private view {
        if (msg.sender != address(manager) || sender != address(router) || !poolInitialized) {
            revert InvalidHookContext();
        }
        if (PoolId.unwrap(key.toId()) != PoolId.unwrap(_bossPoolId)) revert InvalidPool();
    }

    function _clearStage(uint8 stage) private {
        _assertRegisteredPositions(stage);
        uint256 capacity = stageCapacity[stage];
        uint256 sold = stageSold[stage];
        if (sold == 0 || sold > capacity) revert InvalidStage();
        uint256 dust = capacity - sold;
        // A 32-spacing range can cross one bitmap-word boundary: at most two output steps per attack.
        if (dust > 2 * stageAttackCount[stage] + 1) revert InvalidStage();
        roundingDust[stage] = dust;
        (stageEndSqrtPriceX96[stage],,,) = manager.getSlot0(_bossPoolId);
        emit StageCleared(stage, sold, capacity, dust);

        if (stage == 2) {
            status = RoundStatus.Defeated;
            finalEligibleHP = stageSold[0] + stageSold[1] + stageSold[2];
            if (finalEligibleHP == 0) revert InvalidStage();
            emit BossDefeated(finalEligibleHP, originalPrize);
        } else {
            status = RoundStatus.StageCleared;
        }
    }

    function _clearVolumeStage(uint8 stage) private {
        if (stageVolume[stage] < stageVolumeTarget[stage]) revert InvalidStage();
        emit StageCleared(stage, stageSold[stage], stageCapacity[stage], 0);
        if (stage == 2) {
            status = RoundStatus.Defeated;
            finalEligibleHP = eligibleHP;
            if (finalEligibleHP == 0) revert InvalidStage();
            emit BossDefeated(finalEligibleHP, originalPrize);
        } else {
            status = RoundStatus.StageCleared;
        }
    }

    function _inputAmount(BalanceDelta delta, bool zeroForOne) private pure returns (uint256 amount) {
        int128 raw = zeroForOne ? delta.amount0() : delta.amount1();
        if (raw >= 0) revert InvalidSwap();
        amount = uint256(uint128(-raw));
    }

    function _assertRegisteredPositions(uint8 throughStage) private view {
        uint128 summedLiquidity;
        for (uint8 stage = 0; stage <= throughStage; stage++) {
            uint128 expected = stageLiquidity[stage] - (stage == 0 ? 0 : stageLiquidity[stage - 1]);
            (uint128 actual,,) = manager.getPositionInfo(
                _bossPoolId, address(router), LOWER_TICK, UPPER_TICK, bytes32(uint256(stage + 1))
            );
            if (actual != expected) revert InvalidPosition();
            summedLiquidity += actual;
        }
        if (summedLiquidity != stageLiquidity[throughStage]) revert InvalidPosition();
    }

    function _remainingSellableHP(uint160 price, uint128 liquidity) private view returns (uint256) {
        if (bossIsCurrency0) {
            if (price >= sqrtUpperX96) return 0;
            uint160 startPrice = price <= sqrtLowerX96 ? sqrtLowerX96 : price;
            return SqrtPriceMath.getAmount0Delta(startPrice, sqrtUpperX96, liquidity, false);
        }
        if (price <= sqrtLowerX96) return 0;
        uint160 endPrice = price >= sqrtUpperX96 ? sqrtUpperX96 : price;
        return SqrtPriceMath.getAmount1Delta(sqrtLowerX96, endPrice, liquidity, false);
    }

    function _refillInput(uint160 price, uint128 liquidity) private view returns (uint256) {
        return bossIsCurrency0
            ? BossPricing.stageRoyInputRequirement(sqrtLowerX96, price, liquidity, true)
            : BossPricing.stageRoyInputRequirement(price, sqrtUpperX96, liquidity, false);
    }

    function _stageRoyInputRequirement(uint8 stage) private view returns (uint256) {
        return BossPricing.stageRoyInputRequirement(bossIsCurrency0, LOWER_TICK, UPPER_TICK, stageLiquidity[stage]);
    }

    function _capacityForLiquidity(uint128 liquidity) private view returns (uint256) {
        return BossPricing.hpAmountForLiquidity(sqrtLowerX96, sqrtUpperX96, liquidity, bossIsCurrency0);
    }

}
