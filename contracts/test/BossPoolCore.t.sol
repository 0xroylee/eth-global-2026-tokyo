// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {BossHP} from "../src/BossHP.sol";
import {BossHook} from "../src/BossHook.sol";
import {BossRouter} from "../src/BossRouter.sol";
import {BossCollectibles} from "../src/BossCollectibles.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {RoyToken} from "../src/RoyToken.sol";
import {HookMiner} from "../src/libraries/HookMiner.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {StateLibrary} from "v4-core/src/libraries/StateLibrary.sol";
import {TransientStateLibrary} from "v4-core/src/libraries/TransientStateLibrary.sol";

contract TestCreate2Deployer {
    function deploy(bytes32 salt, bytes calldata initCode) external returns (address deployed) {
        bytes memory code = initCode;
        assembly ("memory-safe") {
            deployed := create2(0, add(code, 0x20), mload(code), salt)
        }
        require(deployed != address(0), "create2 failed");
    }
}

contract UnauthorizedSwapProbe is IUnlockCallback {
    IPoolManager public immutable manager;

    constructor(IPoolManager manager_) {
        manager = manager_;
    }

    function attempt(PoolKey calldata key, bool zeroForOne, uint160 limit) external {
        manager.unlock(abi.encode(key, zeroForOne, limit));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        require(msg.sender == address(manager), "manager only");
        (PoolKey memory key, bool zeroForOne, uint160 limit) = abi.decode(data, (PoolKey, bool, uint160));
        manager.swap(key, SwapParams(zeroForOne, -1, limit), bytes(""));
        return bytes("");
    }
}

contract BossPoolCoreTest is Test {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using TransientStateLibrary for IPoolManager;

    uint256 private constant BOSS_HP_SUPPLY = 2_000e18;
    uint256 private constant ROY_SUPPLY = 100_000e18;
    uint256 private constant PRIZE = 1_000e6;
    uint256 private constant SUPPLY_USD = 5_000e6;
    uint256 private constant SUPPLY_ROY = 50_000e18;
    uint160 private constant HOOK_FLAGS = 0x2ac0;
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);

    IPoolManager private manager;
    BossHP private bossHP;
    RoyToken private roy;
    MockUSD private mockUSD;
    BossCollectibles private collectibles;
    BossRouter private router;
    BossHook private hook;
    uint64 private roundDeadline;
    uint160 private supplyStartSqrtPriceX96;
    int24 private supplyLowerTick;
    int24 private supplyUpperTick;

    function setUp() public {
        manager = IPoolManager(vm.deployCode("out/PoolManager.sol/PoolManager.json", abi.encode(address(this))));
        mockUSD = MockUSD(vm.deployCode("out/MockUSD.sol/MockUSD.json"));
        roy = RoyToken(vm.deployCode("out/RoyToken.sol/RoyToken.json", abi.encode(address(this), ROY_SUPPLY)));
        bossHP = BossHP(vm.deployCode("out/BossHP.sol/BossHP.json", abi.encode(address(this), BOSS_HP_SUPPLY)));
        collectibles = BossCollectibles(
            vm.deployCode("out/BossCollectibles.sol/BossCollectibles.json", abi.encode(address(this)))
        );
        router = BossRouter(
            vm.deployCode(
                "out/BossRouter.sol/BossRouter.json",
                abi.encode(manager, mockUSD, roy, bossHP, address(this))
            )
        );

        roundDeadline = uint64(block.timestamp + 2 hours);
        bytes memory constructorArgs = abi.encode(
            manager,
            router,
            mockUSD,
            roy,
            bossHP,
            collectibles,
            address(this),
            PRIZE,
            uint256(roundDeadline)
        );
        bytes memory initCode = abi.encodePacked(vm.getCode("out/BossHook.sol/BossHook.json"), constructorArgs);
        TestCreate2Deployer create2Deployer = new TestCreate2Deployer();
        (address predictedHook, bytes32 salt) = HookMiner.find(address(create2Deployer), HOOK_FLAGS, initCode, bytes(""));
        hook = BossHook(create2Deployer.deploy(salt, initCode));
        assertEq(address(hook), predictedHook);

        router.setHook(hook);
        collectibles.setMinter(address(hook));
        bossHP.transfer(address(router), BOSS_HP_SUPPLY);
        roy.transfer(address(router), ROY_SUPPLY);
        mockUSD.faucet(address(router), SUPPLY_USD + 1e6);
        mockUSD.faucet(address(this), PRIZE);
        mockUSD.approve(address(hook), PRIZE);
        hook.fundPrize();
        mockUSD.faucet(ALICE, 4_000e6);
        mockUSD.faucet(BOB, 4_000e6);

        bool mockIsCurrency0 = address(mockUSD) < address(roy);
        int24 startTick = mockIsCurrency0 ? int24(299_520) : int24(-299_520);
        supplyStartSqrtPriceX96 = TickMath.getSqrtPriceAtTick(startTick);
        supplyLowerTick = startTick - 6_000;
        supplyUpperTick = startTick + 6_000;
    }

    function test_TwoWalletTwoHopThreeStagesClaimsAndRollback() public {
        _prepareActiveRound();
        _assertGatesAndRejectUnauthorizedSwap();
        _attackPartiallyWithAlice();
        _assertFailedTransitionRollsBack();
        _clearAllStagesWithTwoRefills();
        _transferAndRedeemEligibleHP();
        _claimVictoryNFTs();
    }

    function _assertGatesAndRejectUnauthorizedSwap() private {
        assertEq(uint8(hook.status()), uint8(BossHook.RoundStatus.Active));
        assertEq(hook.currentStage(), 0);
        assertEq(hook.stageSold(0), 0);
        assertGe(hook.stageCapacity(0), 300e18);
        assertLe(hook.stageCapacity(0), 300e18 + 1);
        assertGe(hook.stageCapacity(1), 600e18);
        assertLe(hook.stageCapacity(1), 600e18 + 1);
        assertGe(hook.stageCapacity(2), 900e18);
        assertLe(hook.stageCapacity(2), 900e18 + 1);
        assertGe(router.minimumBossHPForVictoryPath(), 1_802e18);
        assertLe(router.minimumBossHPForVictoryPath(), 1_803e18);
        assertEq(bossHP.totalSupply(), BOSS_HP_SUPPLY);
        assertEq(bossHP.balanceOf(address(router)) + bossHP.balanceOf(address(manager)), BOSS_HP_SUPPLY);
        assertEq(_positionLiquidity(2), 0, "stage two remains gated");
        assertEq(_positionLiquidity(3), 0, "stage three remains gated");
        assertGe(_seededRoyOutputCapacity(), hook.minimumRoyForVictoryPath());

        UnauthorizedSwapProbe probe = new UnauthorizedSwapProbe(manager);
        PoolKey memory bossKey = router.bossPoolKey();
        bool bossIsCurrency0 = hook.bossIsCurrency0();
        uint160 sellLimit = bossIsCurrency0 ? hook.sqrtLowerX96() : hook.sqrtUpperX96();
        vm.expectRevert();
        probe.attempt(bossKey, bossIsCurrency0, sellLimit);
        assertEq(hook.stageSold(0), 0, "unauthorized swap cannot deal damage");
    }

    function _attackPartiallyWithAlice() private {
        uint256 aliceSupplyBefore = bossHP.totalSupply();
        uint256 aliceHPBefore = bossHP.balanceOf(ALICE);
        uint256 aliceUSD = mockUSD.balanceOf(ALICE);
        (uint256 firstSpend, uint256 firstRoyBought, uint256 firstRoySpent, uint256 firstHPOut) =
            _attack(ALICE, 1e6, 0);
        assertGt(firstSpend, 0);
        assertLe(firstRoySpent, firstRoyBought);
        assertGt(firstHPOut, 0);
        assertEq(bossHP.balanceOf(ALICE) - aliceHPBefore, firstHPOut);
        assertEq(hook.stageSold(0), firstHPOut);
        assertEq(bossHP.totalSupply(), aliceSupplyBefore, "attacks do not burn");
        assertEq(aliceUSD - mockUSD.balanceOf(ALICE), firstSpend);
        assertEq(manager.getNonzeroDeltaCount(), 0, "all first attack deltas settled");
        assertEq(hook.currentStage(), 0, "partial attack stays in its stage");
    }

    function _assertFailedTransitionRollsBack() private {
        PoolKey memory bossKey = router.bossPoolKey();
        uint256 reserveBeforeFailure = bossHP.balanceOf(address(router));
        vm.prank(address(router));
        bossHP.transfer(address(this), reserveBeforeFailure);
        uint256 soldBeforeFailure = hook.stageSold(0);
        uint256 bobUSDBeforeFailure = mockUSD.balanceOf(BOB);
        uint256 bobHPBeforeFailure = bossHP.balanceOf(BOB);
        (uint160 priceBeforeFailure,,,) = manager.getSlot0(bossKey.toId());
        vm.prank(BOB);
        mockUSD.approve(address(router), type(uint256).max);
        vm.expectRevert();
        vm.prank(BOB);
        router.attackWithMockUSD(1_000e6, 1, 1, 0, block.timestamp + 1 hours);
        assertEq(hook.stageSold(0), soldBeforeFailure, "failed release rolls back contribution");
        assertEq(uint8(hook.status()), uint8(BossHook.RoundStatus.Active));
        assertEq(hook.currentStage(), 0);
        assertEq(mockUSD.balanceOf(BOB), bobUSDBeforeFailure, "failed release returns input atomically");
        assertEq(bossHP.balanceOf(BOB), bobHPBeforeFailure, "failed release returns HP atomically");
        (uint160 priceAfterFailure,,,) = manager.getSlot0(bossKey.toId());
        assertEq(priceAfterFailure, priceBeforeFailure, "failed release rolls back pool price");
        vm.prank(address(this));
        bossHP.transfer(address(router), reserveBeforeFailure);
    }

    function _clearAllStagesWithTwoRefills() private {
        vm.recordLogs();
        (uint256 stageOneSpend, uint256 stageOneRoy, uint256 stageOneRoySpent, uint256 stageOneHP) =
            _attack(BOB, 1_000e6, 0);
        assertGt(stageOneSpend, 0);
        assertGt(stageOneRoy, stageOneRoySpent);
        assertGt(stageOneHP, 0);
        assertEq(hook.currentStage(), 1);
        assertEq(hook.stageSold(1), 0, "clearing attack cannot spill");
        assertGt(hook.stageSold(0), 0);
        assertEq(_positionLiquidity(2), hook.stageLiquidity(1) - hook.stageLiquidity(0));
        assertEq(_positionLiquidity(3), 0, "stage three remains gated");
        _assertBossPriceAtReset();
        assertEq(manager.getNonzeroDeltaCount(), 0, "stage one reset deltas settled");

        _attack(ALICE, 1_000e6, 1);
        assertEq(hook.currentStage(), 2);
        assertEq(hook.stageSold(2), 0, "second clearing attack cannot spill");
        assertGt(_positionLiquidity(3), 0, "stage three released");
        _assertBossPriceAtReset();
        assertEq(manager.getNonzeroDeltaCount(), 0, "stage two reset deltas settled");

        uint256 finalSupplyBefore = bossHP.totalSupply();
        _attack(BOB, 1_000e6, 2);
        assertEq(uint8(hook.status()), uint8(BossHook.RoundStatus.Defeated));
        assertEq(hook.currentStage(), 2, "final ABI stage remains zero-based 2");
        assertGt(hook.finalEligibleHP(), 0);
        assertEq(
            hook.finalEligibleHP(), hook.stageSold(0) + hook.stageSold(1) + hook.stageSold(2)
        );
        assertEq(hook.roundingDust(0), hook.stageCapacity(0) - hook.stageSold(0));
        assertEq(hook.roundingDust(1), hook.stageCapacity(1) - hook.stageSold(1));
        assertEq(hook.roundingDust(2), hook.stageCapacity(2) - hook.stageSold(2));
        assertEq(bossHP.totalSupply(), finalSupplyBefore, "total supply unchanged through defeat");
        assertEq(manager.getNonzeroDeltaCount(), 0, "all final attack deltas settled");
        assertEq(hook.redeemedHP(), 0);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 refillEvents;
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == address(router) && logs[i].topics[0] == keccak256("StageRefilled(uint8,uint256,uint256,uint8)")) {
                refillEvents++;
            }
        }
        assertEq(refillEvents, 2, "exactly two reserve refills");
    }

    function _transferAndRedeemEligibleHP() private {
        uint256 soldBeforeTransfer = hook.stageSold(0) + hook.stageSold(1) + hook.stageSold(2);
        uint256 bobEligible = bossHP.balanceOf(BOB);
        vm.prank(BOB);
        bossHP.transfer(ALICE, bobEligible);
        assertEq(hook.stageSold(0) + hook.stageSold(1) + hook.stageSold(2), soldBeforeTransfer);
        assertEq(bossHP.balanceOf(ALICE) + bossHP.balanceOf(BOB), hook.finalEligibleHP());

        vm.startPrank(ALICE);
        bossHP.approve(address(hook), type(uint256).max);
        uint256 firstClaim = hook.claimReward(1e18);
        assertEq(hook.redeemedHP(), 1e18, "partial claim surrenders exactly the selected HP");
        assertEq(bossHP.balanceOf(address(hook)), 1e18, "surrendered HP is in permanent custody");
        uint256 remainder = hook.finalEligibleHP() - 1e18;
        uint256 finalClaim = hook.claimReward(remainder);
        vm.stopPrank();

        assertEq(finalClaim, Math.mulDiv(PRIZE, remainder, hook.finalEligibleHP()), "final claim rounds down");
        assertEq(hook.redeemedHP(), hook.finalEligibleHP());
        assertEq(bossHP.balanceOf(address(hook)), hook.finalEligibleHP());
        assertLe(firstClaim + finalClaim, PRIZE);
        assertLe(PRIZE - firstClaim - finalClaim, 1, "two floor-rounded claims leave at most one USD base unit");
        assertEq(mockUSD.balanceOf(address(hook)), 2 * hook.ENROLLMENT_FEE() + PRIZE - hook.paidPrize());
        assertEq(bossHP.totalSupply(), BOSS_HP_SUPPLY, "claims never burn BossHP");
    }

    function _claimVictoryNFTs() private {
        vm.prank(ALICE);
        uint256 aliceVictory = hook.claimVictoryNFT();
        vm.prank(BOB);
        uint256 bobVictory = hook.claimVictoryNFT();
        assertTrue(collectibles.isVictoryToken(aliceVictory));
        assertTrue(collectibles.isVictoryToken(bobVictory));
        assertEq(collectibles.ownerOf(aliceVictory), ALICE);
        assertEq(collectibles.ownerOf(bobVictory), BOB);
    }

    function test_DeadlineStopsEnrollmentAndAttackAndRefundsPrizeOnce() public {
        _prepareActiveRound();
        uint256 aliceUSD = mockUSD.balanceOf(ALICE);
        vm.warp(roundDeadline);
        vm.prank(ALICE);
        vm.expectRevert();
        hook.enroll();
        assertEq(mockUSD.balanceOf(ALICE), aliceUSD, "deadline enrollment rejection is atomic");

        vm.prank(ALICE);
        mockUSD.approve(address(router), type(uint256).max);
        vm.prank(ALICE);
        vm.expectRevert();
        router.attackWithMockUSD(1e6, 1, 1, 0, roundDeadline);
        assertEq(hook.stageSold(0), 0);

        vm.prank(BOB);
        hook.expire();
        assertEq(uint8(hook.status()), uint8(BossHook.RoundStatus.Expired));
        uint256 makerBalance = mockUSD.balanceOf(address(this));
        hook.refundExpiredPrize();
        assertEq(mockUSD.balanceOf(address(this)) - makerBalance, PRIZE);
        vm.expectRevert();
        hook.refundExpiredPrize();
    }

    function test_DeadlineRejectsSupplySeedAndActivationBeforeLockingLP() public {
        vm.warp(roundDeadline);
        vm.expectRevert(BossRouter.InvalidSetup.selector);
        _seedSupplyPool();
        assertFalse(router.supplyPoolSeeded());
        assertFalse(hook.poolInitialized());

        vm.warp(roundDeadline - 1);
        _seedSupplyPool();
        assertTrue(router.supplyPoolSeeded());
        vm.warp(roundDeadline);
        vm.expectRevert(BossRouter.InvalidSetup.selector);
        router.activate();
        assertFalse(router.activated());
        assertFalse(hook.poolInitialized(), "deadline rejection leaves the Boss pool uninitialized");
        assertEq(uint8(hook.status()), uint8(BossHook.RoundStatus.Setup));
    }

    function _enroll(address player) private {
        vm.startPrank(player);
        mockUSD.approve(address(hook), type(uint256).max);
        hook.enroll();
        vm.stopPrank();
        assertTrue(hook.enrolled(player));
        assertEq(roy.balanceOf(player), 100e18);
    }

    function _prepareActiveRound() private {
        _seedSupplyPool();
        router.activate();
        _enroll(ALICE);
        _enroll(BOB);
    }

    function _seedSupplyPool() private {
        bool mockIsCurrency0 = address(mockUSD) < address(roy);
        uint128 liquidity = _supplyLiquidity(
            supplyStartSqrtPriceX96, supplyLowerTick, supplyUpperTick, mockIsCurrency0
        );
        router.seedSupplyPool(supplyStartSqrtPriceX96, supplyLowerTick, supplyUpperTick, liquidity);
    }

    function _attack(address player, uint256 maxMockUSD, uint8 stage)
        private
        returns (uint256 spent, uint256 royBought, uint256 roySpent, uint256 hpOut)
    {
        vm.startPrank(player);
        mockUSD.approve(address(router), type(uint256).max);
        (spent, royBought, roySpent, hpOut) = router.attackWithMockUSD(
            maxMockUSD, 1, 1, stage, block.timestamp + 1 hours
        );
        vm.stopPrank();
    }

    function _positionLiquidity(uint256 salt) private view returns (uint128 liquidity) {
        PoolKey memory key = router.bossPoolKey();
        (liquidity,,) = manager.getPositionInfo(key.toId(), address(router), 0, 1_920, bytes32(salt));
    }

    function _seededRoyOutputCapacity() private view returns (uint256) {
        PoolKey memory key = router.supplyPoolKey();
        (uint128 liquidity,,) = manager.getPositionInfo(
            key.toId(), address(router), supplyLowerTick, supplyUpperTick, bytes32(uint256(1))
        );
        if (address(mockUSD) < address(roy)) {
            return SqrtPriceMath.getAmount1Delta(
                TickMath.getSqrtPriceAtTick(supplyLowerTick), supplyStartSqrtPriceX96, liquidity, false
            );
        }
        return SqrtPriceMath.getAmount0Delta(
            supplyStartSqrtPriceX96, TickMath.getSqrtPriceAtTick(supplyUpperTick), liquidity, false
        );
    }

    function _assertBossPriceAtReset() private view {
        PoolKey memory key = router.bossPoolKey();
        (uint160 price,,,) = manager.getSlot0(key.toId());
        assertEq(price, hook.bossIsCurrency0() ? hook.sqrtLowerX96() : hook.sqrtUpperX96());
    }

    function _supplyLiquidity(uint160 current, int24 tickLower, int24 tickUpper, bool mockIsCurrency0)
        private
        pure
        returns (uint128 liquidity)
    {
        uint160 lower = TickMath.getSqrtPriceAtTick(tickLower);
        uint160 upper = TickMath.getSqrtPriceAtTick(tickUpper);
        uint256 amount0 = mockIsCurrency0 ? SUPPLY_USD : SUPPLY_ROY;
        uint256 amount1 = mockIsCurrency0 ? SUPPLY_ROY : SUPPLY_USD;

        uint256 liquidity0;
        if (current <= lower) {
            uint256 intermediate = FullMath.mulDiv(lower, upper, FixedPoint96.Q96);
            liquidity0 = FullMath.mulDiv(amount0, intermediate, upper - lower);
            liquidity = uint128(liquidity0);
            return liquidity;
        }
        if (current >= upper) {
            liquidity = uint128(FullMath.mulDiv(amount1, FixedPoint96.Q96, upper - lower));
            return liquidity;
        }

        uint256 intermediateCurrentUpper = FullMath.mulDiv(current, upper, FixedPoint96.Q96);
        liquidity0 = FullMath.mulDiv(amount0, intermediateCurrentUpper, upper - current);
        uint256 liquidity1 = FullMath.mulDiv(amount1, FixedPoint96.Q96, current - lower);
        liquidity = uint128(liquidity0 < liquidity1 ? liquidity0 : liquidity1);
    }
}
