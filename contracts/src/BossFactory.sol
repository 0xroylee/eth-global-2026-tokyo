// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BossHook} from "./BossHook.sol";
import {BossRouter} from "./BossRouter.sol";
import {BossCollectibles} from "./BossCollectibles.sol";
import {IBossRouterContext} from "./interfaces/IBossRouterContext.sol";
import {BossPricing} from "./libraries/BossPricing.sol";

/// @notice Permissionless launchpad. Each round sells a creator-selected ERC-20 for measured MockUSD volume.
contract BossFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;

    uint16 public constant PRIZE_RATE_DENOMINATOR = 10_000;
    uint16 public constant SALE_BUDGET_BPS = 9_900;

    struct LaunchConfig {
        IERC20 token;
        uint256 tokenAllocation;
        uint16 prizeBps;
        uint256 volumeTargetMockUSD;
        uint256 deadline; // Must be zero: Factory bosses never expire.
        uint256 maxAttackTokenPerMockUSDX128;
    }

    struct LaunchQuote {
        uint256 prizeAmount;
        uint256 battleTokenBudget;
        uint256 saleHPBudget;
        uint256 requiredBattleTokenFunding;
        uint256 estimatedAttackToken;
        uint256 stageOneHP;
        int24 hpPriceTick;
        uint256 maxRoyPerMockUSDX128;
    }

    IPoolManager public immutable manager;
    IERC20 public immutable mockUSD;
    IERC20 public immutable attackToken;
    bytes32 public immutable routerCodeHash;
    bytes32 public immutable hookCodeHash;
    mapping(bytes32 bossId => BossHook) public bosses;
    uint256 public bossCount;

    error InvalidLaunch();
    error TokenFundingMismatch();
    error SupplyMarketUnavailable();

    event BossLaunched(
        bytes32 indexed bossId,
        address indexed maker,
        address indexed token,
        address hook,
        address router,
        address collectibles,
        uint256 tokenAllocation,
        uint256 prizeAmount,
        uint256 volumeTargetMockUSD,
        int24 hpPriceTick
    );

    constructor(
        IPoolManager manager_,
        IERC20 mockUSD_,
        IERC20 attackToken_,
        bytes32 routerCodeHash_,
        bytes32 hookCodeHash_
    ) {
        if (
            address(manager_).code.length == 0 || address(mockUSD_).code.length == 0
                || address(attackToken_).code.length == 0 || mockUSD_ == attackToken_ || routerCodeHash_ == bytes32(0)
                || hookCodeHash_ == bytes32(0)
        ) revert InvalidLaunch();
        manager = manager_;
        mockUSD = mockUSD_;
        attackToken = attackToken_;
        routerCodeHash = routerCodeHash_;
        hookCodeHash = hookCodeHash_;
    }

    function quoteLaunch(LaunchConfig calldata config) public view returns (LaunchQuote memory quote) {
        if (
            address(config.token).code.length == 0 || config.token == mockUSD || config.token == attackToken
                || config.tokenAllocation < 6 || config.prizeBps == 0 || config.prizeBps >= PRIZE_RATE_DENOMINATOR
                || config.volumeTargetMockUSD < 6 || config.deadline != 0
        ) revert InvalidLaunch();

        quote.prizeAmount = FullMath.mulDiv(config.tokenAllocation, config.prizeBps, PRIZE_RATE_DENOMINATOR);
        quote.battleTokenBudget = config.tokenAllocation - quote.prizeAmount;
        quote.stageOneHP = FullMath.mulDiv(quote.battleTokenBudget, SALE_BUDGET_BPS, PRIZE_RATE_DENOMINATOR) / 6;
        if (quote.prizeAmount == 0 || quote.stageOneHP < 2 || quote.stageOneHP > uint256(uint128(type(int128).max)) / 6)
        {
            revert InvalidLaunch();
        }
        quote.saleHPBudget = quote.stageOneHP * 6;

        bool mockUSDIsCurrency0 = address(mockUSD) < address(attackToken);
        PoolKey memory supplyKey = PoolKey({
            currency0: mockUSDIsCurrency0 ? Currency.wrap(address(mockUSD)) : Currency.wrap(address(attackToken)),
            currency1: mockUSDIsCurrency0 ? Currency.wrap(address(attackToken)) : Currency.wrap(address(mockUSD)),
            fee: 3_000,
            tickSpacing: 60,
            hooks: IHooks(address(0))
        });
        PoolId supplyPoolId = supplyKey.toId();
        (uint160 sqrtPriceX96,, uint24 protocolFee, uint24 lpFee) = manager.getSlot0(supplyPoolId);
        if (sqrtPriceX96 == 0 || manager.getLiquidity(supplyPoolId) == 0 || protocolFee != 0 || lpFee != 3_000) {
            revert SupplyMarketUnavailable();
        }

        uint256 currentMaxRoyPerMockUSDX128 = BossPricing.maxRoyPerMockUSDX128(sqrtPriceX96, mockUSDIsCurrency0);
        if (config.maxAttackTokenPerMockUSDX128 == 0) {
            // A public quote with no frozen rate discovers the current accepted rate.
            quote.maxRoyPerMockUSDX128 = currentMaxRoyPerMockUSDX128;
        } else {
            // The configured rate is frozen into hook init code. The inverse recovers
            // the integer spot from BossPricing's rounded-up 10% headroom rate.
            uint256 currentSpotX128 = FullMath.mulDiv(currentMaxRoyPerMockUSDX128, 10_000, 11_000);
            if (currentSpotX128 > config.maxAttackTokenPerMockUSDX128) revert SupplyMarketUnavailable();
            quote.maxRoyPerMockUSDX128 = config.maxAttackTokenPerMockUSDX128;
        }
        quote.estimatedAttackToken =
            FullMath.mulDivRoundingUp(config.volumeTargetMockUSD, quote.maxRoyPerMockUSDX128, 1 << 128);
        quote.hpPriceTick =
            BossPricing.startTickForVolume(config.volumeTargetMockUSD, quote.saleHPBudget, quote.maxRoyPerMockUSDX128);
        quote.requiredBattleTokenFunding = BossPricing.minimumBattleTokenFunding(
            quote.stageOneHP, quote.hpPriceTick, address(config.token) < address(attackToken)
        );
        if (quote.requiredBattleTokenFunding == 0 || quote.requiredBattleTokenFunding > quote.battleTokenBudget) {
            revert InvalidLaunch();
        }
    }

    /// @dev Mine hookSalt off chain using hookInitCode and address(this), with flags 0x2ac0.
    function launchBoss(
        LaunchConfig calldata config,
        bytes32 userSalt,
        bytes32 hookSalt,
        bytes calldata routerCode,
        bytes calldata hookCode
    ) external nonReentrant returns (BossHook hook, BossRouter router) {
        bytes32 bossId = keccak256(abi.encode(msg.sender, userSalt));
        if (address(bosses[bossId]) != address(0) || config.maxAttackTokenPerMockUSDX128 == 0) {
            revert InvalidLaunch();
        }
        _validateCode(routerCode, hookCode);
        LaunchQuote memory quote = quoteLaunch(config);
        router = BossRouter(Create2.deploy(0, bossId, _routerInitCode(config.token, routerCode)));
        BossCollectibles collectibles = new BossCollectibles{salt: bossId}(address(this));
        hook = BossHook(
            Create2.deploy(
                0,
                hookSalt,
                abi.encodePacked(hookCode, _hookArgs(config, quote, address(router), address(collectibles), msg.sender))
            )
        );
        router.setHook(hook);
        collectibles.setMinter(address(hook));

        _fund(config.token, msg.sender, address(hook), quote.prizeAmount);
        _fund(config.token, msg.sender, address(router), quote.battleTokenBudget);
        hook.fundPrize();
        router.activate();
        router.transferOwnership(msg.sender);
        bosses[bossId] = hook;
        bossCount++;
        emit BossLaunched(
            bossId,
            msg.sender,
            address(config.token),
            address(hook),
            address(router),
            address(collectibles),
            config.tokenAllocation,
            quote.prizeAmount,
            config.volumeTargetMockUSD,
            quote.hpPriceTick
        );
    }

    function predictAddresses(address maker, bytes32 userSalt, IERC20 token, bytes calldata routerCode)
        public
        view
        returns (address router, address collectibles)
    {
        bytes32 bossId = keccak256(abi.encode(maker, userSalt));
        if (keccak256(routerCode) != routerCodeHash) revert InvalidLaunch();
        router = Create2.computeAddress(bossId, keccak256(_routerInitCode(token, routerCode)));
        bytes32 codeHash = keccak256(abi.encodePacked(type(BossCollectibles).creationCode, abi.encode(address(this))));
        collectibles =
            address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), bossId, codeHash)))));
    }

    function hookInitCode(
        address maker,
        bytes32 userSalt,
        LaunchConfig calldata config,
        bytes calldata routerCode,
        bytes calldata hookCode
    ) external view returns (bytes memory) {
        if (config.maxAttackTokenPerMockUSDX128 == 0) revert InvalidLaunch();
        _validateCode(routerCode, hookCode);
        LaunchQuote memory quote = quoteLaunch(config);
        (address router, address collectibles) = predictAddresses(maker, userSalt, config.token, routerCode);
        return abi.encodePacked(hookCode, _hookArgs(config, quote, router, collectibles, maker));
    }

    function _fund(IERC20 token, address from, address to, uint256 amount) private {
        uint256 balanceBefore = token.balanceOf(to);
        token.safeTransferFrom(from, to, amount);
        if (token.balanceOf(to) - balanceBefore != amount) revert TokenFundingMismatch();
    }

    function _validateCode(bytes calldata routerCode, bytes calldata hookCode) private view {
        if (keccak256(routerCode) != routerCodeHash || keccak256(hookCode) != hookCodeHash) revert InvalidLaunch();
    }

    function _routerInitCode(IERC20 token, bytes calldata routerCode) private view returns (bytes memory) {
        return abi.encodePacked(routerCode, abi.encode(manager, mockUSD, attackToken, token, address(this)));
    }

    function _hookArgs(
        LaunchConfig calldata config,
        LaunchQuote memory quote,
        address router,
        address collectibles,
        address maker
    ) private view returns (bytes memory) {
        return abi.encode(
            manager,
            IBossRouterContext(router),
            mockUSD,
            attackToken,
            config.token,
            BossCollectibles(collectibles),
            maker,
            BossHook.RoundConfig(
                quote.prizeAmount,
                config.deadline,
                quote.stageOneHP,
                quote.hpPriceTick,
                true,
                true,
                config.volumeTargetMockUSD,
                quote.saleHPBudget,
                quote.maxRoyPerMockUSDX128
            )
        );
    }
}
