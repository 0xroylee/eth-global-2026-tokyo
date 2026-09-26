// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {FixedPoint96} from "v4-core/src/libraries/FixedPoint96.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {HookMiner} from "../src/libraries/HookMiner.sol";
import {BossHP} from "../src/BossHP.sol";
import {BossHook} from "../src/BossHook.sol";
import {BossRouter} from "../src/BossRouter.sol";
import {BossCollectibles} from "../src/BossCollectibles.sol";
import {MockUSD} from "../src/MockUSD.sol";
import {RoyToken} from "../src/RoyToken.sol";

/// @notice Deploys and seeds the local real-v4 Boss Pool fixture.
contract DeployBossPool is Script {
    struct Deployment {
        address deployer;
        PoolManager manager;
        MockUSD mockUSD;
        RoyToken roy;
        BossHP bossHP;
        BossCollectibles collectibles;
        BossRouter router;
        BossHook hook;
    }

    struct SeedConfig {
        uint160 hookFlags;
        int24 supplyStartTick;
        int24 supplyLowerTick;
        int24 supplyUpperTick;
        uint160 supplySqrtPriceX96;
        uint128 supplyLiquidity;
        uint256 supplyUSDFunded;
        uint256 supplyROYFunded;
        uint256 supplyUSDDebited;
        uint256 supplyROYDebited;
    }

    uint256 private constant PRIZE_AMOUNT = 1_000e6;
    uint256 private constant SUPPLY_USD = 5_000e6;
    uint256 private constant SUPPLY_ROY = 50_000e18;
    uint256 private constant ROY_SUPPLY = 100_000e18;
    uint256 private constant BOSS_HP_SUPPLY = 2_000e18;
    uint160 private constant HOOK_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG
            | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
    );

    function run() external {
        address deployer;
        if (block.chainid == 31337) {
            deployer = tx.origin;
            vm.startBroadcast();
        } else if (block.chainid == 84_532) {
            uint256 deployerKey = vm.envUint("TESTNET_DEPLOYER_PRIVATE_KEY");
            deployer = vm.addr(deployerKey);
            require(deployer == tx.origin, "testnet sender mismatch");
            vm.startBroadcast(deployerKey);
        } else {
            revert("unsupported chain");
        }
        uint256 deadline = block.timestamp + 2 hours;

        Deployment memory deployment;
        deployment.deployer = deployer;
        deployment.manager = new PoolManager(deployer);
        deployment.mockUSD = new MockUSD();
        deployment.roy = new RoyToken(deployer, ROY_SUPPLY);
        deployment.bossHP = new BossHP(deployer, BOSS_HP_SUPPLY);
        deployment.collectibles = new BossCollectibles(deployer);
        deployment.router = new BossRouter(
            deployment.manager, deployment.mockUSD, deployment.roy, deployment.bossHP, deployer
        );
        LocalCreate2Deployer create2Deployer = new LocalCreate2Deployer(deployer);

        uint160 flags = HOOK_FLAGS;
        require(flags == 0x2AC0, "hook flags changed");
        deployment.hook = _deployHook(create2Deployer, flags, deployment, deployer, deadline);
        deployment.collectibles.setMinter(address(deployment.hook));
        deployment.router.setHook(deployment.hook);

        deployment.roy.transfer(address(deployment.router), ROY_SUPPLY);
        deployment.bossHP.transfer(address(deployment.router), BOSS_HP_SUPPLY);
        deployment.mockUSD.faucet(address(deployment.router), SUPPLY_USD + 1e6);
        deployment.mockUSD.faucet(deployer, PRIZE_AMOUNT);
        deployment.mockUSD.approve(address(deployment.hook), PRIZE_AMOUNT);
        deployment.hook.fundPrize();

        bool mockIsCurrency0 = address(deployment.mockUSD) < address(deployment.roy);
        SeedConfig memory seed;
        seed.hookFlags = flags;
        seed.supplyStartTick = mockIsCurrency0 ? int24(299_520) : int24(-299_520);
        seed.supplyLowerTick = seed.supplyStartTick - 6_000;
        seed.supplyUpperTick = seed.supplyStartTick + 6_000;
        seed.supplySqrtPriceX96 = TickMath.getSqrtPriceAtTick(seed.supplyStartTick);
        seed.supplyLiquidity = _supplyLiquidity(
            seed.supplySqrtPriceX96, seed.supplyLowerTick, seed.supplyUpperTick, mockIsCurrency0
        );
        seed.supplyUSDFunded = deployment.mockUSD.balanceOf(address(deployment.router));
        seed.supplyROYFunded = deployment.roy.balanceOf(address(deployment.router));
        deployment.router.seedSupplyPool(
            seed.supplySqrtPriceX96, seed.supplyLowerTick, seed.supplyUpperTick, seed.supplyLiquidity
        );
        seed.supplyUSDDebited = seed.supplyUSDFunded - deployment.mockUSD.balanceOf(address(deployment.router));
        seed.supplyROYDebited = seed.supplyROYFunded - deployment.roy.balanceOf(address(deployment.router));
        deployment.router.activate();

        _logDeployment(deployment, seed);
        vm.stopBroadcast();
    }

    function _deployHook(
        LocalCreate2Deployer create2Deployer,
        uint160 flags,
        Deployment memory deployment,
        address maker,
        uint256 deadline
    ) private returns (BossHook hook) {
        bytes memory constructorArgs = abi.encode(
            deployment.manager,
            deployment.router,
            deployment.mockUSD,
            deployment.roy,
            deployment.bossHP,
            deployment.collectibles,
            maker,
            PRIZE_AMOUNT,
            deadline
        );
        (address expectedAddress, bytes32 salt) = HookMiner.find(
            address(create2Deployer), flags, type(BossHook).creationCode, constructorArgs
        );
        bytes memory initCode = abi.encodePacked(type(BossHook).creationCode, constructorArgs);
        address deployedAddress = create2Deployer.deploy(salt, initCode);
        require(deployedAddress == expectedAddress, "hook address mismatch");
        hook = BossHook(deployedAddress);
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
            return uint128(liquidity0);
        }
        if (current >= upper) return uint128(FullMath.mulDiv(amount1, FixedPoint96.Q96, upper - lower));

        uint256 intermediateCurrentUpper = FullMath.mulDiv(current, upper, FixedPoint96.Q96);
        liquidity0 = FullMath.mulDiv(amount0, intermediateCurrentUpper, upper - current);
        uint256 liquidity1 = FullMath.mulDiv(amount1, FixedPoint96.Q96, current - lower);
        return uint128(liquidity0 < liquidity1 ? liquidity0 : liquidity1);
    }

    function _logDeployment(Deployment memory deployment, SeedConfig memory seed) private view {
        string memory summary = string.concat("{\"chainId\":", vm.toString(block.chainid));
        summary = string.concat(summary, ",\"deployer\":\"", vm.toString(deployment.deployer), "\"");
        summary = string.concat(summary, ",\"addresses\":", _addressesJson(deployment));
        summary = string.concat(summary, ",\"pools\":", _poolsJson(deployment.router));
        summary = string.concat(summary, ",\"config\":", _configJson(deployment, seed));
        summary = string.concat(summary, ",\"prefunded\":", _prefundedJson(deployment), "}");
        console2.log(string.concat("BOSS_POOL_DEPLOYMENT_JSON=", summary));
    }

    function _addressesJson(Deployment memory deployment) private pure returns (string memory result) {
        result = "{\"hook\":\"";
        result = string.concat(result, vm.toString(address(deployment.hook)), "\",\"router\":\"");
        result = string.concat(result, vm.toString(address(deployment.router)), "\",\"bossHP\":\"");
        result = string.concat(result, vm.toString(address(deployment.bossHP)), "\",\"roy\":\"");
        result = string.concat(result, vm.toString(address(deployment.roy)), "\",\"mockUSD\":\"");
        result = string.concat(result, vm.toString(address(deployment.mockUSD)), "\",\"collectibles\":\"");
        result = string.concat(result, vm.toString(address(deployment.collectibles)), "\",\"poolManager\":\"");
        return string.concat(result, vm.toString(address(deployment.manager)), "\"}");
    }

    function _poolsJson(BossRouter router) private view returns (string memory) {
        string memory pools = string.concat("{\"supply\":", _poolJson(router.supplyPoolKey(), router.supplyPoolId()));
        pools = string.concat(pools, ",\"boss\":", _poolJson(router.bossPoolKey(), router.bossPoolId()));
        return string.concat(pools, "}");
    }

    function _prefundedJson(Deployment memory deployment) private view returns (string memory result) {
        uint256 routerRoy = deployment.roy.balanceOf(address(deployment.router));
        result = "{\"routerBossHP\":\"";
        result = string.concat(result, vm.toString(deployment.bossHP.balanceOf(address(deployment.router))), "\",\"routerROY\":\"");
        result = string.concat(result, vm.toString(routerRoy), "\",\"routerMockUSD\":\"");
        result = string.concat(result, vm.toString(deployment.mockUSD.balanceOf(address(deployment.router))), "\",\"ownerROY\":\"");
        result = string.concat(result, vm.toString(deployment.roy.balanceOf(deployment.deployer)), "\",\"lockedRouterROY\":\"");
        result = string.concat(result, vm.toString(routerRoy), "\",\"poolManagerBossHP\":\"");
        result = string.concat(result, vm.toString(deployment.bossHP.balanceOf(address(deployment.manager))), "\",\"mockUSDInHook\":\"");
        return string.concat(result, vm.toString(deployment.mockUSD.balanceOf(address(deployment.hook))), "\"}");
    }

    function _configJson(Deployment memory deployment, SeedConfig memory seed)
        private
        view
        returns (string memory result)
    {
        result = string.concat(
            "{\"hookFlags\":\"", vm.toString(address(uint160(seed.hookFlags))), "\""
        );
        result = string.concat(result, ",\"fee\":3000,\"tickSpacing\":60,\"bossTicks\":[");
        result = string.concat(
            result,
            vm.toString(int256(deployment.hook.LOWER_TICK())),
            ",",
            vm.toString(int256(deployment.hook.UPPER_TICK())),
            "],\"bossIsCurrency0\":",
            deployment.hook.bossIsCurrency0() ? "true" : "false"
        );
        result = string.concat(
            result,
            ",\"bossInitialSqrtPriceX96\":\"",
            vm.toString(uint256(deployment.hook.lastSqrtPriceX96())),
            "\",\"bossSqrtLowerX96\":\"",
            vm.toString(uint256(deployment.hook.sqrtLowerX96())),
            "\",\"bossSqrtUpperX96\":\"",
            vm.toString(uint256(deployment.hook.sqrtUpperX96())),
            "\""
        );
        uint160 terminalPrice = deployment.hook.bossIsCurrency0()
            ? deployment.hook.sqrtUpperX96()
            : deployment.hook.sqrtLowerX96();
        result = string.concat(
            result,
            ",\"expectedStageTerminalSqrtPriceX96\":\"",
            vm.toString(uint256(terminalPrice)),
            "\""
        );
        result = string.concat(result, ",\"supplyStartTick\":");
        result = string.concat(result, vm.toString(int256(seed.supplyStartTick)), ",\"supplyTicks\":[");
        result = string.concat(result, vm.toString(int256(seed.supplyLowerTick)), ",", vm.toString(int256(seed.supplyUpperTick)), "]");
        result = string.concat(result, ",\"initialSupplySqrtPriceX96\":\"", vm.toString(uint256(seed.supplySqrtPriceX96)), "\"");
        result = string.concat(result, ",\"supplyLiquidity\":\"", vm.toString(uint256(seed.supplyLiquidity)), "\"");
        result = string.concat(result, ",\"supplyLPAccounting\":", _supplyAccountingJson(seed));
        result = string.concat(result, ",", _stageConfigJson(deployment.hook));
        result = string.concat(result, ",\"originalPrize\":\"", vm.toString(deployment.hook.originalPrize()), "\"");
        return string.concat(result, ",\"deadline\":\"", vm.toString(deployment.hook.deadline()), "\"}");
    }

    function _supplyAccountingJson(SeedConfig memory seed) private pure returns (string memory) {
        return string.concat(
            "{\"mockUSDFunded\":\"", vm.toString(seed.supplyUSDFunded),
            "\",\"royFunded\":\"", vm.toString(seed.supplyROYFunded),
            "\",\"mockUSDDebited\":\"", vm.toString(seed.supplyUSDDebited),
            "\",\"royDebited\":\"", vm.toString(seed.supplyROYDebited), "\"}"
        );
    }

    function _stageConfigJson(BossHook hook) private view returns (string memory) {
        string memory capacities = string.concat(
            "[\"", vm.toString(hook.stageCapacity(0)), "\",\"",
            vm.toString(hook.stageCapacity(1)), "\",\"", vm.toString(hook.stageCapacity(2)), "\"]"
        );
        string memory liquidities = string.concat(
            "[\"", vm.toString(uint256(hook.stageLiquidity(0))), "\",\"",
            vm.toString(uint256(hook.stageLiquidity(1))), "\",\"",
            vm.toString(uint256(hook.stageLiquidity(2))), "\"]"
        );
        string memory endPrices = string.concat(
            "[\"", vm.toString(uint256(hook.stageEndSqrtPriceX96(0))), "\",\"",
            vm.toString(uint256(hook.stageEndSqrtPriceX96(1))), "\",\"",
            vm.toString(uint256(hook.stageEndSqrtPriceX96(2))), "\"]"
        );
        string memory royInputs = string.concat(
            "[\"", vm.toString(hook.stageRoyInputRequirement(0)), "\",\"",
            vm.toString(hook.stageRoyInputRequirement(1)), "\",\"",
            vm.toString(hook.stageRoyInputRequirement(2)), "\"]"
        );
        return string.concat(
            "\"stageCapacity\":", capacities,
            ",\"stageLiquidity\":", liquidities,
            ",\"observedStageEndSqrtPriceX96\":", endPrices,
            ",\"stageRoyInputRequirement\":", royInputs
        );
    }

    function _poolJson(PoolKey memory key, bytes32 id) private pure returns (string memory) {
        return string.concat(
            "{\"id\":\"", vm.toString(id),
            "\",\"key\":{\"currency0\":\"", vm.toString(Currency.unwrap(key.currency0)),
            "\",\"currency1\":\"", vm.toString(Currency.unwrap(key.currency1)),
            "\",\"fee\":", vm.toString(uint256(key.fee)),
            ",\"tickSpacing\":", vm.toString(int256(key.tickSpacing)),
            ",\"hooks\":\"", vm.toString(address(key.hooks)), "\"}}"
        );
    }
}

/// @dev Local-only CREATE2 factory used to mine and deploy the hook with real address flags.
contract LocalCreate2Deployer {
    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function deploy(bytes32 salt, bytes calldata initCode) external returns (address deployed) {
        require(msg.sender == owner, "unauthorized");
        bytes memory code = initCode;
        assembly {
            deployed := create2(0, add(code, 0x20), mload(code), salt)
        }
        require(deployed != address(0), "create2 failed");
    }
}
