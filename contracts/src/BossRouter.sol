// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BossHP} from "./BossHP.sol";
import {BossHook} from "./BossHook.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TransientStateLibrary} from "v4-core/src/libraries/TransientStateLibrary.sol";

/// @notice Two-hop attack route and sole owner of staged battle-pool positions/reserves.
contract BossRouter is IUnlockCallback, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;
    using TransientStateLibrary for IPoolManager;

    enum Operation {
        Idle,
        SeedSupply,
        Setup,
        Attack,
        Transition,
        Quote
    }

    struct AttackRequest {
        address player;
        uint256 maxMockUSD;
        uint256 minRoyOut;
        uint256 minBossHPOut;
        uint8 stage;
        uint256 deadline;
    }

    struct AttackResult {
        uint256 mockUSDSpent;
        uint256 royBought;
        uint256 roySpent;
        uint256 bossHPOut;
    }

    struct QuoteResult {
        uint256 mockUSDSpent;
        uint256 royBought;
        uint256 roySpent;
        uint256 bossHPOut;
        bool stageCleared;
        bool bossDefeated;
        uint8 nextStage;
    }

    address private constant QUOTE_SINK = address(0x000000000000000000000000000000000000dEaD);

    uint24 public constant SWAP_FEE = 3_000;
    int24 public constant TICK_SPACING = 60;
    uint256 public constant STARTER_ROY_BUDGET = 10_000e18;

    IPoolManager public immutable manager;
    IERC20 public immutable mockUSD;
    IERC20 public immutable roy;
    BossHP public immutable bossHP;
    BossHook public bossHook;
    PoolKey private _supplyPoolKey;
    PoolKey private _bossPoolKey;
    Operation public mode;
    address public activePlayer;
    uint8 public expectedStage;
    uint8 public pendingStage;
    uint256 public starterRoyPaid;
    bool public supplyPoolSeeded;
    bool public activated;

    error Unauthorized();
    error InvalidSetup();
    error InvalidAttack();
    error InvalidCallback();
    error InsufficientReserve();
    error UnsettledDelta();
    error SlippageExceeded();
    error QuoteSimulation(
        uint256 mockUSDSpent,
        uint256 royBought,
        uint256 roySpent,
        uint256 bossHPOut,
        bool stageCleared,
        bool bossDefeated,
        uint8 nextStage
    );
    error UnexpectedQuoteSuccess();

    event SupplyPoolSeeded(bytes32 indexed poolId, uint160 sqrtPriceX96, int24 tickLower, int24 tickUpper, uint128 liquidity);
    event RoundActivated(bytes32 indexed bossPoolId, uint160 sqrtPriceX96, uint128 initialLiquidity);
    event AttackExecuted(
        address indexed player,
        uint8 indexed stage,
        uint256 mockUSDSpent,
        uint256 royBought,
        uint256 roySpent,
        uint256 bossHPReceived,
        uint256 mockUSDRefunded,
        uint256 royRefunded
    );
    event StageRefilled(uint8 indexed clearedStage, uint256 bossHPIn, uint256 royRecovered, uint8 nextStage);

    constructor(IPoolManager manager_, IERC20 mockUSD_, IERC20 roy_, BossHP bossHP_, address initialOwner)
        Ownable(initialOwner)
    {
        require(address(manager_) != address(0) && address(mockUSD_) != address(0) && address(roy_) != address(0));
        require(address(bossHP_) != address(0));
        manager = manager_;
        mockUSD = mockUSD_;
        roy = roy_;
        bossHP = bossHP_;

        Currency mockCurrency = Currency.wrap(address(mockUSD_));
        Currency royCurrency = Currency.wrap(address(roy_));
        Currency supply0 = Currency.unwrap(mockCurrency) < Currency.unwrap(royCurrency) ? mockCurrency : royCurrency;
        Currency supply1 = Currency.unwrap(mockCurrency) < Currency.unwrap(royCurrency) ? royCurrency : mockCurrency;
        _supplyPoolKey = PoolKey({
            currency0: supply0,
            currency1: supply1,
            fee: SWAP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(0))
        });
    }

    function setHook(BossHook hook_) external onlyOwner {
        if (address(bossHook) != address(0) || address(hook_).code.length == 0 || activated) revert InvalidSetup();
        bossHook = hook_;
        Currency bossCurrency = Currency.wrap(address(bossHP));
        Currency royCurrency = Currency.wrap(address(roy));
        Currency boss0 = Currency.unwrap(bossCurrency) < Currency.unwrap(royCurrency) ? bossCurrency : royCurrency;
        Currency boss1 = Currency.unwrap(bossCurrency) < Currency.unwrap(royCurrency) ? royCurrency : bossCurrency;
        _bossPoolKey = PoolKey({
            currency0: boss0,
            currency1: boss1,
            fee: SWAP_FEE,
            tickSpacing: TICK_SPACING,
            hooks: IHooks(address(hook_))
        });
    }

    function supplyPoolKey() external view returns (PoolKey memory) {
        return _supplyPoolKey;
    }

    function bossPoolKey() external view returns (PoolKey memory) {
        return _bossPoolKey;
    }

    function supplyPoolId() external view returns (bytes32) {
        return PoolId.unwrap(_supplyPoolKey.toId());
    }

    function bossPoolId() public view returns (bytes32) {
        return PoolId.unwrap(_bossPoolKey.toId());
    }

    function seedSupplyPool(uint160 initialSqrtPriceX96, int24 tickLower, int24 tickUpper, uint128 liquidity)
        external
        onlyOwner
        nonReentrant
    {
        if (
            address(bossHook) == address(0) || block.timestamp >= bossHook.deadline() || supplyPoolSeeded
                || activated || liquidity == 0
                || tickLower >= tickUpper || tickLower % TICK_SPACING != 0 || tickUpper % TICK_SPACING != 0
        ) revert InvalidSetup();
        uint160 lowerSqrt = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 upperSqrt = TickMath.getSqrtPriceAtTick(tickUpper);
        if (initialSqrtPriceX96 <= lowerSqrt || initialSqrtPriceX96 >= upperSqrt) revert InvalidSetup();
        uint256 sellableRoy = address(mockUSD) < address(roy)
            ? SqrtPriceMath.getAmount1Delta(lowerSqrt, initialSqrtPriceX96, liquidity, false)
            : SqrtPriceMath.getAmount0Delta(initialSqrtPriceX96, upperSqrt, liquidity, false);
        if (sellableRoy < bossHook.minimumRoyForVictoryPath()) revert InvalidSetup();

        mode = Operation.SeedSupply;
        manager.unlock(abi.encode(initialSqrtPriceX96, tickLower, tickUpper, liquidity));
        mode = Operation.Idle;
        supplyPoolSeeded = true;
        emit SupplyPoolSeeded(PoolId.unwrap(_supplyPoolKey.toId()), initialSqrtPriceX96, tickLower, tickUpper, liquidity);
    }

    function activate() external onlyOwner nonReentrant {
        if (
            activated || mode != Operation.Idle || !supplyPoolSeeded || address(bossHook) == address(0)
                || block.timestamp >= bossHook.deadline()
                || bossHP.balanceOf(address(this)) != bossHP.totalSupply()
                || bossHP.balanceOf(address(this)) < minimumBossHPForVictoryPath()
                || roy.balanceOf(address(this)) < STARTER_ROY_BUDGET
                || !bossHook.prizeFunded() || mockUSD.balanceOf(address(bossHook)) < bossHook.originalPrize()
        ) revert InvalidSetup();

        mode = Operation.Setup;
        manager.unlock(bytes(""));
        bossHook.activateFromRouter();
        activated = true;
        mode = Operation.Idle;
        emit RoundActivated(bossPoolId(), _bossStartPrice(), bossHook.stageLiquidity(0));
    }

    function minimumBossHPForVictoryPath() public view returns (uint256) {
        if (address(bossHook) == address(0)) return 0;
        return bossHook.stageLiquidityDeposit(0) + bossHook.stageRefillRequirement(0)
            + bossHook.stageLiquidityDeposit(1) + bossHook.stageRefillRequirement(1)
            + bossHook.stageLiquidityDeposit(2);
    }

    function payStarterRoy(address recipient, uint256 amount) external {
        if (msg.sender != address(bossHook) || !activated || amount != bossHook.STARTER_ROY()) revert Unauthorized();
        if (starterRoyPaid + amount > STARTER_ROY_BUDGET) revert InsufficientReserve();
        starterRoyPaid += amount;
        roy.safeTransfer(recipient, amount);
    }

    function attackWithMockUSD(
        uint256 maxMockUSD,
        uint256 minRoyOut,
        uint256 minBossHPOut,
        uint8 attackStage,
        uint256 callDeadline
    ) external nonReentrant returns (uint256 mockUSDSpent, uint256 royBought, uint256 roySpent, uint256 bossHPOut) {
        if (
            !activated || mode != Operation.Idle || block.timestamp >= bossHook.deadline() || maxMockUSD == 0
                || maxMockUSD > uint256(type(int256).max)
                || minBossHPOut == 0 || callDeadline < block.timestamp || callDeadline > bossHook.deadline()
                || attackStage != bossHook.currentStage() || bossHook.status() != BossHook.RoundStatus.Active
                || !bossHook.enrolled(msg.sender)
        ) revert InvalidAttack();

        mockUSD.safeTransferFrom(msg.sender, address(this), maxMockUSD);
        mode = Operation.Attack;
        activePlayer = msg.sender;
        expectedStage = attackStage;
        bytes memory result = manager.unlock(
            abi.encode(AttackRequest(msg.sender, maxMockUSD, minRoyOut, minBossHPOut, attackStage, callDeadline))
        );
        (mockUSDSpent, royBought, roySpent, bossHPOut) = abi.decode(result, (uint256, uint256, uint256, uint256));

        uint256 mockUSDRefunded = maxMockUSD - mockUSDSpent;
        if (mockUSDRefunded != 0) mockUSD.safeTransfer(msg.sender, mockUSDRefunded);
        uint256 royRefunded = royBought - roySpent;
        mode = Operation.Idle;
        activePlayer = address(0);
        expectedStage = 0;
        emit AttackExecuted(msg.sender, attackStage, mockUSDSpent, royBought, roySpent, bossHPOut, mockUSDRefunded, royRefunded);
    }

    /// @notice Simulates the normal two-hop attack and any resulting stage transition without player funding.
    /// @dev Not view: like V4Quoter, this executes real swap code and decodes only its intentional revert result.
    function quoteAttackWithMockUSD(uint256 maxMockUSD, uint8 attackStage)
        external
        nonReentrant
        returns (QuoteResult memory quote)
    {
        if (
            !activated || mode != Operation.Idle || block.timestamp >= bossHook.deadline() || maxMockUSD == 0
                || maxMockUSD > uint256(type(int256).max) || attackStage != bossHook.currentStage()
                || bossHook.status() != BossHook.RoundStatus.Active
        ) revert InvalidAttack();

        (bool success, bytes memory reason) = address(this).call(
            abi.encodeCall(this._quoteAttackFrame, (maxMockUSD, attackStage))
        );
        if (success) revert UnexpectedQuoteSuccess();
        return _parseQuoteResult(reason);
    }

    /// @dev Self-only simulation frame. Its callback reverts with the quote after exercising both swaps and transition.
    function _quoteAttackFrame(uint256 maxMockUSD, uint8 attackStage) external {
        if (msg.sender != address(this) || mode != Operation.Idle) revert Unauthorized();
        mode = Operation.Quote;
        activePlayer = QUOTE_SINK;
        expectedStage = attackStage;
        manager.unlock(
            abi.encode(AttackRequest(QUOTE_SINK, maxMockUSD, 0, 0, attackStage, bossHook.deadline()))
        );
        revert UnexpectedQuoteSuccess();
    }

    function _parseQuoteResult(bytes memory reason) private pure returns (QuoteResult memory quote) {
        bytes4 selector;
        if (reason.length >= 4) assembly ("memory-safe") { selector := mload(add(reason, 0x20)) }
        if (selector != QuoteSimulation.selector || reason.length != 4 + 7 * 32) {
            assembly ("memory-safe") { revert(add(reason, 0x20), mload(reason)) }
        }

        uint256 rawStageCleared;
        uint256 rawBossDefeated;
        uint256 rawNextStage;
        assembly ("memory-safe") {
            let data := add(reason, 0x24)
            mstore(quote, mload(data))
            mstore(add(quote, 0x20), mload(add(data, 0x20)))
            mstore(add(quote, 0x40), mload(add(data, 0x40)))
            mstore(add(quote, 0x60), mload(add(data, 0x60)))
            rawStageCleared := mload(add(data, 0x80))
            rawBossDefeated := mload(add(data, 0xa0))
            rawNextStage := mload(add(data, 0xc0))
        }
        if (rawStageCleared > 1 || rawBossDefeated > 1 || rawNextStage > type(uint8).max) {
            assembly ("memory-safe") { revert(add(reason, 0x20), mload(reason)) }
        }
        quote.stageCleared = rawStageCleared == 1;
        quote.bossDefeated = rawBossDefeated == 1;
        quote.nextStage = uint8(rawNextStage);
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert InvalidCallback();
        if (mode == Operation.SeedSupply) return _seedSupplyCallback(data);
        if (mode == Operation.Setup) return _activateCallback();
        if (mode == Operation.Attack) return _attackCallback(data);
        if (mode == Operation.Quote) return _attackCallback(data);
        revert InvalidCallback();
    }

    function _seedSupplyCallback(bytes calldata data) private returns (bytes memory) {
        (uint160 initialSqrtPriceX96, int24 tickLower, int24 tickUpper, uint128 liquidity) =
            abi.decode(data, (uint160, int24, int24, uint128));
        manager.initialize(_supplyPoolKey, initialSqrtPriceX96);
        manager.modifyLiquidity(
            _supplyPoolKey,
            ModifyLiquidityParams(tickLower, tickUpper, int256(uint256(liquidity)), bytes32(uint256(1))),
            bytes("")
        );
        int256 mockDelta = manager.currencyDelta(address(this), Currency.wrap(address(mockUSD)));
        int256 royDelta = manager.currencyDelta(address(this), Currency.wrap(address(roy)));
        if (mockDelta >= 0 || royDelta >= 0) revert InvalidSetup();
        _settlePositionDebts(_supplyPoolKey);
        return bytes("");
    }

    function _activateCallback() private returns (bytes memory) {
        uint160 startPrice = _bossStartPrice();
        manager.initialize(_bossPoolKey, startPrice);
        uint128 liquidity = bossHook.stageLiquidity(0);
        manager.modifyLiquidity(
            _bossPoolKey,
            ModifyLiquidityParams(
                bossHook.LOWER_TICK(), bossHook.UPPER_TICK(), int256(uint256(liquidity)), bytes32(uint256(1))
            ),
            bytes("")
        );

        Currency bossCurrency = Currency.wrap(address(bossHP));
        Currency royCurrency = Currency.wrap(address(roy));
        int256 bossDelta = manager.currencyDelta(address(this), bossCurrency);
        int256 royDelta = manager.currencyDelta(address(this), royCurrency);
        if (bossDelta >= 0 || royDelta != 0) revert InvalidSetup();
        _settle(bossCurrency, uint256(-bossDelta));
        _assertZero(bossCurrency);
        _assertZero(royCurrency);
        return bytes("");
    }

    function _attackCallback(bytes calldata data) private returns (bytes memory) {
        AttackRequest memory request = abi.decode(data, (AttackRequest));
        bool quoteMode = mode == Operation.Quote;
        if (
            request.player != activePlayer || request.stage != expectedStage || request.deadline < block.timestamp
                || bossHook.status() != BossHook.RoundStatus.Active
        ) revert InvalidCallback();

        AttackResult memory result = _executeTwoHop(request);
        bool stageCleared = bossHook.status() == BossHook.RoundStatus.StageCleared
            || bossHook.status() == BossHook.RoundStatus.Defeated;
        bool bossDefeated = bossHook.status() == BossHook.RoundStatus.Defeated;
        if (bossHook.status() == BossHook.RoundStatus.StageCleared) _runTransition(request.stage);
        if (quoteMode) {
            revert QuoteSimulation(
                result.mockUSDSpent,
                result.royBought,
                result.roySpent,
                result.bossHPOut,
                stageCleared,
                bossDefeated,
                bossHook.currentStage()
            );
        }
        return abi.encode(result.mockUSDSpent, result.royBought, result.roySpent, result.bossHPOut);
    }

    function _executeTwoHop(AttackRequest memory request) private returns (AttackResult memory result) {
        bool supplyZeroForOne = address(mockUSD) < address(roy);
        _assertSupplyFee();
        uint160 supplyLimit = supplyZeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        BalanceDelta supplyDelta = manager.swap(
            _supplyPoolKey, SwapParams(supplyZeroForOne, -int256(request.maxMockUSD), supplyLimit), bytes("")
        );
        result.mockUSDSpent = _inputAmount(supplyDelta, supplyZeroForOne);
        result.royBought = _outputAmount(supplyDelta, supplyZeroForOne);
        if (result.mockUSDSpent == 0 || result.royBought < request.minRoyOut) revert SlippageExceeded();
        Currency mockCurrency = Currency.wrap(address(mockUSD));
        if (mode != Operation.Quote) {
            _settle(mockCurrency, result.mockUSDSpent);
            _assertZero(mockCurrency);
        }

        bool bossZeroForOne = !bossHook.bossIsCurrency0();
        uint160 bossLimit = bossHook.bossIsCurrency0() ? bossHook.sqrtUpperX96() : bossHook.sqrtLowerX96();
        BalanceDelta attackDelta = manager.swap(
            _bossPoolKey, SwapParams(bossZeroForOne, -int256(result.royBought), bossLimit), bytes("")
        );
        result.roySpent = _inputAmount(attackDelta, bossZeroForOne);
        result.bossHPOut = _outputAmount(attackDelta, bossZeroForOne);
        if (result.bossHPOut < request.minBossHPOut || result.roySpent > result.royBought) revert SlippageExceeded();

        Currency bossCurrency = Currency.wrap(address(bossHP));
        Currency royCurrency = Currency.wrap(address(roy));
        manager.take(bossCurrency, request.player, result.bossHPOut);
        uint256 unusedRoy = result.royBought - result.roySpent;
        if (unusedRoy != 0) manager.take(royCurrency, request.player, unusedRoy);
        if (mode != Operation.Quote) _assertZero(mockCurrency);
        _assertZero(royCurrency);
        _assertZero(bossCurrency);
    }

    function _runTransition(uint8 clearedStage) private {
        if (clearedStage >= 2 || clearedStage != expectedStage || activePlayer == address(0)) revert InvalidCallback();
        mode = Operation.Transition;
        activePlayer = address(0);
        pendingStage = clearedStage + 1;

        bool refillZeroForOne = bossHook.bossIsCurrency0();
        uint160 refillLimit = bossHook.bossIsCurrency0() ? bossHook.sqrtLowerX96() : bossHook.sqrtUpperX96();
        uint256 refillInput = bossHook.currentRefillInput();
        BalanceDelta refillDelta = manager.swap(
            _bossPoolKey, SwapParams(refillZeroForOne, -int256(refillInput), refillLimit), bytes("")
        );
        uint256 bossHPIn = _inputAmount(refillDelta, refillZeroForOne);
        uint256 royRecovered = _outputAmount(refillDelta, refillZeroForOne);
        if (bossHPIn == 0 || bossHPIn > refillInput || royRecovered == 0) revert InsufficientReserve();

        Currency bossCurrency = Currency.wrap(address(bossHP));
        Currency royCurrency = Currency.wrap(address(roy));
        _settle(bossCurrency, bossHPIn);
        manager.take(royCurrency, address(this), royRecovered);
        _assertZero(bossCurrency);
        _assertZero(royCurrency);

        (uint160 price,,,) = manager.getSlot0(_bossPoolKey.toId());
        uint160 resetPrice = bossHook.bossIsCurrency0() ? bossHook.sqrtLowerX96() : bossHook.sqrtUpperX96();
        if (price != resetPrice) revert InvalidCallback();

        uint8 nextStage = clearedStage + 1;
        uint128 liquidity = bossHook.stageLiquidity(nextStage) - bossHook.stageLiquidity(clearedStage);
        manager.modifyLiquidity(
            _bossPoolKey,
            ModifyLiquidityParams(
                bossHook.LOWER_TICK(), bossHook.UPPER_TICK(),
                int256(uint256(liquidity)), bytes32(uint256(nextStage + 1))
            ),
            bytes("")
        );
        int256 bossDebt = manager.currencyDelta(address(this), bossCurrency);
        int256 royAfterAdd = manager.currencyDelta(address(this), royCurrency);
        if (bossDebt >= 0 || royAfterAdd != 0) revert InvalidCallback();
        _settle(bossCurrency, uint256(-bossDebt));
        _assertZero(bossCurrency);
        _assertZero(royCurrency);

        bossHook.completeStageTransition(nextStage);
        emit StageRefilled(clearedStage, bossHPIn, royRecovered, nextStage);
        pendingStage = 0;
    }

    function _settlePositionDebts(PoolKey memory key) private {
        int256 delta0 = manager.currencyDelta(address(this), key.currency0);
        int256 delta1 = manager.currencyDelta(address(this), key.currency1);
        if (delta0 > 0 || delta1 > 0) revert InvalidSetup();
        if (delta0 < 0) _settle(key.currency0, uint256(-delta0));
        if (delta1 < 0) _settle(key.currency1, uint256(-delta1));
        _assertZero(key.currency0);
        _assertZero(key.currency1);
    }

    function _settle(Currency currency, uint256 amount) private {
        if (amount == 0) return;
        address token = Currency.unwrap(currency);
        manager.sync(currency);
        IERC20(token).safeTransfer(address(manager), amount);
        manager.settle();
    }

    function _inputAmount(BalanceDelta delta, bool zeroForOne) private pure returns (uint256) {
        int128 raw = zeroForOne ? delta.amount0() : delta.amount1();
        if (raw >= 0) revert InvalidCallback();
        return uint256(uint128(-raw));
    }

    function _outputAmount(BalanceDelta delta, bool zeroForOne) private pure returns (uint256) {
        int128 raw = zeroForOne ? delta.amount1() : delta.amount0();
        if (raw < 0) revert InvalidCallback();
        return uint256(uint128(raw));
    }

    function _assertZero(Currency currency) private view {
        if (manager.currencyDelta(address(this), currency) != 0) revert UnsettledDelta();
    }

    function _assertSupplyFee() private view {
        (, , uint24 protocolFee, uint24 lpFee) = manager.getSlot0(_supplyPoolKey.toId());
        if (protocolFee != 0 || lpFee != SWAP_FEE) revert InvalidAttack();
    }

    function _bossStartPrice() private view returns (uint160) {
        return bossHook.bossIsCurrency0() ? bossHook.sqrtLowerX96() : bossHook.sqrtUpperX96();
    }
}
