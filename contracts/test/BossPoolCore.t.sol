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

    struct HP1Round {
        IPoolManager manager;
        MockUSD mockUSD;
        RoyToken roy;
        BossHP bossHP;
        BossCollectibles collectibles;
        BossRouter router;
        BossHook hook;
        uint64 deadline;
    }

    struct AttackAmounts {
        uint256 usdSpent;
        uint256 royBought;
        uint256 roySpent;
        uint256 hpOut;
    }

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
    uint256 private stageOnePartialRoySpent;

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

    function test_PublicQuoteNeedsNoFundingOrAllowanceAndMatchesDirectAttackWithoutEffects() public {
        _seedSupplyPool();
        router.activate();

        address unreadyPlayer = address(0xCAFE);
        address quoteSink = address(0x000000000000000000000000000000000000dEaD);
        PoolKey memory supplyKey = router.supplyPoolKey();
        PoolKey memory bossKey = router.bossPoolKey();
        (uint160 supplyPriceBefore,,,) = manager.getSlot0(supplyKey.toId());
        (uint160 bossPriceBefore,,,) = manager.getSlot0(bossKey.toId());
        uint256 routerUSDBefore = mockUSD.balanceOf(address(router));
        uint256 routerRoyBefore = roy.balanceOf(address(router));
        uint256 routerHPBefore = bossHP.balanceOf(address(router));

        vm.prank(unreadyPlayer);
        BossRouter.QuoteResult memory quote = router.quoteAttackWithMockUSD(1e6, 0);

        assertGt(quote.mockUSDSpent, 0);
        assertGt(quote.royBought, 0);
        assertGt(quote.roySpent, 0);
        assertGt(quote.bossHPOut, 0);
        assertFalse(quote.stageCleared);
        assertFalse(quote.bossDefeated);
        assertEq(quote.nextStage, 0);
        assertFalse(hook.hasAttacked(unreadyPlayer));
        assertEq(mockUSD.balanceOf(unreadyPlayer), 0);
        assertEq(mockUSD.allowance(unreadyPlayer, address(router)), 0);
        assertEq(mockUSD.allowance(unreadyPlayer, address(hook)), 0);
        assertEq(roy.balanceOf(unreadyPlayer), 0);
        assertEq(collectibles.balanceOf(unreadyPlayer), 0);
        assertEq(mockUSD.balanceOf(quoteSink), 0);
        assertEq(roy.balanceOf(quoteSink), 0);
        assertEq(bossHP.balanceOf(quoteSink), 0);
        assertEq(uint8(router.mode()), uint8(BossRouter.Operation.Idle));
        assertEq(router.activePlayer(), address(0));
        assertEq(router.expectedStage(), 0);
        assertEq(router.pendingStage(), 0);
        assertEq(hook.stageSold(0), 0);
        assertEq(hook.stageAttackCount(0), 0);
        assertEq(uint8(hook.status()), uint8(BossHook.RoundStatus.Active));
        assertEq(hook.currentStage(), 0);
        assertEq(mockUSD.balanceOf(address(router)), routerUSDBefore);
        assertEq(roy.balanceOf(address(router)), routerRoyBefore);
        assertEq(bossHP.balanceOf(address(router)), routerHPBefore);
        (uint160 supplyPriceAfter,,,) = manager.getSlot0(supplyKey.toId());
        (uint160 bossPriceAfter,,,) = manager.getSlot0(bossKey.toId());
        assertEq(supplyPriceAfter, supplyPriceBefore);
        assertEq(bossPriceAfter, bossPriceBefore);
        assertEq(manager.getNonzeroDeltaCount(), 0);

        _assertFreshWalletDirectAttack(unreadyPlayer, quote);
    }

    function _assertFreshWalletDirectAttack(address player, BossRouter.QuoteResult memory quote) private {
        mockUSD.faucet(player, 1_000e6);
        vm.startPrank(player);
        mockUSD.approve(address(router), type(uint256).max);
        (uint256 spent, uint256 royBought, uint256 roySpent, uint256 hpOut) = router.attackWithMockUSD(
            1e6, 1, 1, 0, block.timestamp + 1 hours
        );
        vm.stopPrank();

        assertEq(quote.mockUSDSpent, spent);
        assertEq(quote.royBought, royBought);
        assertEq(quote.roySpent, roySpent);
        assertEq(quote.bossHPOut, hpOut);
        assertTrue(hook.hasAttacked(player), "fresh wallet receives a recorded attack");
        assertEq(mockUSD.balanceOf(address(hook)), PRIZE, "attack collects no entry fee");
        assertEq(collectibles.nextTokenId(), 1, "direct attack mints no entry NFT");
        assertEq(collectibles.balanceOf(player), 0, "direct attack mints no NFT");
    }

    function _assertGatesAndRejectUnauthorizedSwap() private {
        assertEq(hook.LOWER_TICK(), 0);
        assertEq(hook.UPPER_TICK(), 1_920);
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
        assertEq(roy.balanceOf(ALICE), 0, "fresh attacker needs no starter ROY");
        assertEq(collectibles.balanceOf(ALICE), 0, "fresh attacker needs no entry NFT");
        assertEq(mockUSD.allowance(ALICE, address(hook)), 0, "attack needs no Hook approval");
        uint256 aliceUSD = mockUSD.balanceOf(ALICE);
        vm.prank(ALICE);
        vm.expectRevert();
        router.attackWithMockUSD(1e6, 1, 1, 0, block.timestamp + 1 hours);
        assertEq(mockUSD.balanceOf(ALICE), aliceUSD, "attack without Router approval leaves funds unchanged");
        assertEq(hook.stageSold(0), 0, "attack without Router approval deals no damage");
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
        stageOnePartialRoySpent = firstRoySpent;
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
        vm.expectRevert();
        router.quoteAttackWithMockUSD(1_000e6, 0);
        assertEq(hook.stageSold(0), soldBeforeFailure, "unexpected quote failure bubbles and rolls back damage");
        assertEq(uint8(router.mode()), uint8(BossRouter.Operation.Idle), "failed quote leaves context idle");
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

        _quoteFinalDefeatAndMatchAttack();
        assertEq(uint8(hook.status()), uint8(BossHook.RoundStatus.Defeated));
        assertEq(hook.currentStage(), 2, "final ABI stage remains zero-based 2");
        assertGt(hook.finalEligibleHP(), 0);
        assertEq(
            hook.finalEligibleHP(), hook.stageSold(0) + hook.stageSold(1) + hook.stageSold(2)
        );
        assertEq(mockUSD.balanceOf(address(hook)), PRIZE, "attacks leave prize custody unchanged");
        assertEq(collectibles.nextTokenId(), 1, "attacks mint no entry NFT");
        assertEq(hook.roundingDust(0), hook.stageCapacity(0) - hook.stageSold(0));
        assertEq(hook.roundingDust(1), hook.stageCapacity(1) - hook.stageSold(1));
        assertEq(hook.roundingDust(2), hook.stageCapacity(2) - hook.stageSold(2));
        assertEq(hook.stageEndSqrtPriceX96(0), TickMath.getSqrtPriceAtTick(hook.UPPER_TICK()));
        assertEq(hook.stageEndSqrtPriceX96(1), TickMath.getSqrtPriceAtTick(hook.UPPER_TICK()));
        assertEq(hook.stageEndSqrtPriceX96(2), TickMath.getSqrtPriceAtTick(hook.UPPER_TICK()));
        uint256 stageOneRoyalSpent = stageOnePartialRoySpent + stageOneRoySpent;
        uint256 stageOneQuote = hook.stageRoyInputRequirement(0);
        uint256 stageOneQuoteDifference = stageOneRoyalSpent > stageOneQuote
            ? stageOneRoyalSpent - stageOneQuote
            : stageOneQuote - stageOneRoyalSpent;
        assertLe(stageOneQuoteDifference, 2 * hook.stageAttackCount(0) + 2);
        assertApproxEqAbs(stageOneQuote, 331_219_793_595_396_366_740, 1e12);
        assertEq(bossHP.totalSupply(), BOSS_HP_SUPPLY, "total supply unchanged through defeat");
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

    function _quoteFinalDefeatAndMatchAttack() private {
        uint256 finalEligibleBefore = hook.finalEligibleHP();
        uint256 redeemedBefore = hook.redeemedHP();
        uint256 paidPrizeBefore = hook.paidPrize();
        uint256 escrowBefore = mockUSD.balanceOf(address(hook));
        uint256 soldBefore = hook.stageSold(2);
        uint256 supplyBefore = bossHP.totalSupply();
        address quoteSink = address(0x000000000000000000000000000000000000dEaD);
        uint256 sinkHPBefore = bossHP.balanceOf(quoteSink);

        BossRouter.QuoteResult memory quote = router.quoteAttackWithMockUSD(1_000e6, 2);
        assertTrue(quote.stageCleared);
        assertTrue(quote.bossDefeated);
        assertEq(quote.nextStage, 2);
        assertEq(hook.finalEligibleHP(), finalEligibleBefore, "final quote does not freeze eligible supply");
        assertEq(hook.redeemedHP(), redeemedBefore);
        assertEq(hook.paidPrize(), paidPrizeBefore);
        assertEq(mockUSD.balanceOf(address(hook)), escrowBefore, "final quote leaves prize escrow untouched");
        assertEq(hook.stageSold(2), soldBefore, "final quote rolls back stage sales");
        assertEq(bossHP.balanceOf(quoteSink), sinkHPBefore);
        assertEq(bossHP.totalSupply(), supplyBefore);
        assertEq(uint8(hook.status()), uint8(BossHook.RoundStatus.Active));
        assertEq(hook.currentStage(), 2);
        assertEq(uint8(router.mode()), uint8(BossRouter.Operation.Idle));
        assertEq(manager.getNonzeroDeltaCount(), 0);

        (uint256 spent, uint256 royBought, uint256 roySpent, uint256 hpOut) = _attack(BOB, 1_000e6, 2);
        assertEq(quote.mockUSDSpent, spent);
        assertEq(quote.royBought, royBought);
        assertEq(quote.roySpent, roySpent);
        assertEq(quote.bossHPOut, hpOut);
        assertEq(bossHP.totalSupply(), supplyBefore);
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
        assertEq(mockUSD.balanceOf(address(hook)), PRIZE - hook.paidPrize(), "only the prize is held by Hook");
        assertEq(bossHP.totalSupply(), BOSS_HP_SUPPLY, "claims never burn BossHP");
        assertEq(collectibles.nextTokenId(), 1, "attacks and token claims mint no NFT");
        assertEq(collectibles.balanceOf(ALICE) + collectibles.balanceOf(BOB), 0, "no entry NFT is minted");
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
        assertEq(aliceVictory, 1, "optional victory NFT ids start at one");
        assertEq(bobVictory, 2, "victory NFT ids follow claim order");
        assertEq(collectibles.nextTokenId(), 3);
    }

    function test_DeadlineStopsAttackAndRefundsPrizeOnce() public {
        _prepareActiveRound();
        uint256 aliceUSD = mockUSD.balanceOf(ALICE);
        vm.warp(roundDeadline);
        vm.prank(ALICE);
        mockUSD.approve(address(router), type(uint256).max);
        vm.prank(ALICE);
        vm.expectRevert();
        router.attackWithMockUSD(1e6, 1, 1, 0, roundDeadline);
        assertEq(mockUSD.balanceOf(ALICE), aliceUSD, "deadline attack rejection is atomic");
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

    function test_BossHPCurrencyOneKeepsNormalizedRangeAndRefillsAtomically() public {
        HP1Round memory round = _deployHP1Round();
        assertGt(uint160(address(round.bossHP)), uint160(address(round.roy)));
        assertFalse(round.hook.bossIsCurrency0());
        assertEq(round.hook.LOWER_TICK(), -1_920);
        assertEq(round.hook.UPPER_TICK(), 0);
        assertEq(round.hook.sqrtUpperX96(), TickMath.getSqrtPriceAtTick(0));
        assertEq(uint8(round.hook.status()), uint8(BossHook.RoundStatus.Active));
        assertEq(round.hook.currentStage(), 0);

        PoolKey memory bossKey = round.router.bossPoolKey();
        (uint160 startPrice,,,) = round.manager.getSlot0(bossKey.toId());
        assertEq(startPrice, TickMath.getSqrtPriceAtTick(0), "human ROY/HP starts at 1");

        vm.prank(address(0xCAFE));
        BossRouter.QuoteResult memory initialQuote = round.router.quoteAttackWithMockUSD(1e6, 0);
        assertGt(initialQuote.bossHPOut, 0, "currency1 pool quote works for a fresh wallet");
        assertEq(round.mockUSD.balanceOf(address(0xCAFE)), 0);
        assertEq(round.roy.balanceOf(address(0xCAFE)), 0);
        assertEq(round.collectibles.balanceOf(address(0xCAFE)), 0);
        assertEq(round.mockUSD.allowance(address(0xCAFE), address(round.hook)), 0);
        assertEq(round.hook.stageSold(0), 0, "currency1 quote rolls back contribution");
        assertEq(round.manager.getNonzeroDeltaCount(), 0);

        uint256 initialSupply = round.bossHP.totalSupply();
        AttackAmounts memory partialAttack = _attackForRound(round, ALICE, 1e6, 0);
        assertGt(partialAttack.hpOut, 0);
        assertEq(round.bossHP.balanceOf(ALICE), partialAttack.hpOut);
        assertEq(initialQuote.mockUSDSpent, partialAttack.usdSpent);
        assertEq(initialQuote.royBought, partialAttack.royBought);
        assertEq(initialQuote.roySpent, partialAttack.roySpent);
        assertEq(initialQuote.bossHPOut, partialAttack.hpOut);
        (uint160 partialPrice,,,) = round.manager.getSlot0(bossKey.toId());
        assertLt(partialPrice, startPrice, "human ROY/HP rises as the pool price falls");

        BossRouter.QuoteResult memory clearQuote = round.router.quoteAttackWithMockUSD(1_000e6, 0);
        assertTrue(clearQuote.stageCleared);
        assertFalse(clearQuote.bossDefeated);
        assertEq(clearQuote.nextStage, 1);
        assertEq(round.hook.currentStage(), 0, "currency1 clear preview leaves the live stage unchanged");
        assertEq(round.manager.getNonzeroDeltaCount(), 0);
        AttackAmounts memory clearAttack = _attackForRound(round, BOB, 1_000e6, 0);
        assertEq(clearQuote.mockUSDSpent, clearAttack.usdSpent);
        assertEq(clearQuote.royBought, clearAttack.royBought);
        assertEq(clearQuote.roySpent, clearAttack.roySpent);
        assertEq(clearQuote.bossHPOut, clearAttack.hpOut);
        assertGt(clearAttack.hpOut, 0);
        assertGt(clearAttack.royBought, clearAttack.roySpent, "unused supply-pool ROY returns to the player");
        assertEq(round.hook.currentStage(), 1);
        assertEq(round.hook.stageSold(1), 0, "clearing attack cannot spill");
        assertEq(
            round.hook.stageEndSqrtPriceX96(0),
            TickMath.getSqrtPriceAtTick(-1_920),
            "human ROY/HP ends at the configured upper price"
        );
        assertEq(-TickMath.getTickAtSqrtPrice(round.hook.stageEndSqrtPriceX96(0)), 1_920);
        (uint160 resetPrice,,,) = round.manager.getSlot0(bossKey.toId());
        assertEq(resetPrice, TickMath.getSqrtPriceAtTick(0), "controller refill restores human price 1");

        uint256 stageRoySpent = partialAttack.roySpent + clearAttack.roySpent;
        uint256 stageQuote = round.hook.stageRoyInputRequirement(0);
        uint256 difference = stageRoySpent > stageQuote ? stageRoySpent - stageQuote : stageQuote - stageRoySpent;
        assertLe(difference, 2 * round.hook.stageAttackCount(0) + 2, "per-step and per-swap ceil rounding");
        assertApproxEqAbs(stageQuote, 331_219_793_595_396_366_740, 1e12);
        assertEq(round.bossHP.totalSupply(), initialSupply, "currency1 route never burns HP");
        assertEq(round.manager.getNonzeroDeltaCount(), 0, "all attack and refill deltas settle");
    }

    function _deployHP1Round() private returns (HP1Round memory round) {
        round.manager = IPoolManager(vm.deployCode("out/PoolManager.sol/PoolManager.json", abi.encode(address(this))));
        round.mockUSD = MockUSD(vm.deployCode("out/MockUSD.sol/MockUSD.json"));

        bool foundHP1Order;
        for (uint256 attempt; attempt < 8; attempt++) {
            BossHP candidateHP = BossHP(
                vm.deployCode("out/BossHP.sol/BossHP.json", abi.encode(address(this), BOSS_HP_SUPPLY))
            );
            RoyToken candidateRoy = RoyToken(
                vm.deployCode("out/RoyToken.sol/RoyToken.json", abi.encode(address(this), ROY_SUPPLY))
            );
            if (address(candidateHP) > address(candidateRoy)) {
                round.bossHP = candidateHP;
                round.roy = candidateRoy;
                foundHP1Order = true;
                break;
            }
        }
        assertTrue(foundHP1Order, "test fixture must exercise BossHP as currency1");

        round.collectibles = BossCollectibles(
            vm.deployCode("out/BossCollectibles.sol/BossCollectibles.json", abi.encode(address(this)))
        );
        round.router = BossRouter(
            vm.deployCode(
                "out/BossRouter.sol/BossRouter.json",
                abi.encode(round.manager, round.mockUSD, round.roy, round.bossHP, address(this))
            )
        );
        round.deadline = uint64(block.timestamp + 2 hours);
        bytes memory constructorArgs = abi.encode(
            round.manager,
            round.router,
            round.mockUSD,
            round.roy,
            round.bossHP,
            round.collectibles,
            address(this),
            PRIZE,
            uint256(round.deadline)
        );
        bytes memory initCode = abi.encodePacked(vm.getCode("out/BossHook.sol/BossHook.json"), constructorArgs);
        TestCreate2Deployer create2Deployer = new TestCreate2Deployer();
        (address predictedHook, bytes32 salt) = HookMiner.find(address(create2Deployer), HOOK_FLAGS, initCode, bytes(""));
        round.hook = BossHook(create2Deployer.deploy(salt, initCode));
        assertEq(address(round.hook), predictedHook);

        round.router.setHook(round.hook);
        round.collectibles.setMinter(address(round.hook));
        round.bossHP.transfer(address(round.router), BOSS_HP_SUPPLY);
        round.roy.transfer(address(round.router), ROY_SUPPLY);
        round.mockUSD.faucet(address(round.router), SUPPLY_USD + 1e6);
        round.mockUSD.faucet(address(this), PRIZE);
        round.mockUSD.approve(address(round.hook), PRIZE);
        round.hook.fundPrize();
        round.mockUSD.faucet(ALICE, 4_000e6);
        round.mockUSD.faucet(BOB, 4_000e6);

        bool mockIsCurrency0 = address(round.mockUSD) < address(round.roy);
        int24 supplyStartTick = mockIsCurrency0 ? int24(299_520) : int24(-299_520);
        uint160 supplySqrt = TickMath.getSqrtPriceAtTick(supplyStartTick);
        int24 supplyLower = supplyStartTick - 6_000;
        int24 supplyUpper = supplyStartTick + 6_000;
        uint128 supplyLiquidity = _supplyLiquidity(supplySqrt, supplyLower, supplyUpper, mockIsCurrency0);
        round.router.seedSupplyPool(supplySqrt, supplyLower, supplyUpper, supplyLiquidity);
        round.router.activate();
    }

    function _attackForRound(HP1Round memory round, address player, uint256 maxMockUSD, uint8 stage)
        private
        returns (AttackAmounts memory result)
    {
        vm.startPrank(player);
        round.mockUSD.approve(address(round.router), type(uint256).max);
        (result.usdSpent, result.royBought, result.roySpent, result.hpOut) = round.router.attackWithMockUSD(
            maxMockUSD, 1, 1, stage, block.timestamp + 1 hours
        );
        vm.stopPrank();
    }

    function _prepareActiveRound() private {
        _seedSupplyPool();
        router.activate();
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
