// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {BossFeeController} from "../src/BossFeeController.sol";
import {IBossPriceSource} from "../src/BossFeeController.sol";
import {MockBossPriceSource} from "../src/MockBossPriceSource.sol";
import {BossFactory} from "../src/BossFactory.sol";

/// @notice Deploy a factory against existing infrastructure, pinning this build's contract code.
contract DeployBossFactory is Script {
    function run() external returns (BossFactory factory) {
        IPoolManager manager = IPoolManager(vm.envAddress("BOSS_POOL_MANAGER"));
        IERC20 mockUSD = IERC20(vm.envAddress("BOSS_MOCK_USD_TOKEN"));
        IERC20 attack = IERC20(vm.envAddress("BOSS_ATTACK_TOKEN"));
        bytes32 routerHash = keccak256(vm.getCode("BossRouter.sol:BossRouter"));
        bytes32 hookHash = keccak256(vm.getCode("BossHook.sol:BossHook"));
        address demoToken = vm.envOr("BOSS_DEMO_TOKEN", address(0));
        address demoOwner = block.chainid == 84_532 ? vm.addr(vm.envUint("TESTNET_DEPLOYER_PRIVATE_KEY")) : msg.sender;
        if (block.chainid == 31337) {
            vm.startBroadcast();
        } else if (block.chainid == 84_532) {
            vm.startBroadcast(vm.envUint("TESTNET_DEPLOYER_PRIVATE_KEY"));
        } else {
            revert("unsupported chain");
        }
        BossFeeController controller;
        if (demoToken != address(0)) {
            MockBossPriceSource source = new MockBossPriceSource(demoToken, address(mockUSD), demoOwner);
            controller = new BossFeeController(demoToken, address(mockUSD), address(attack), IBossPriceSource(address(source)), 600, 900_000);
            console2.log("TESTNET MOCK PRICE source", address(source));
            console2.log("Demo fee controller", address(controller));
        }
        factory = new BossFactory(manager, mockUSD, attack, routerHash, hookHash, controller);
        vm.stopBroadcast();
        console2.log("BossFactory", address(factory));
        console2.log("routerCodeHash");
        console2.logBytes32(routerHash);
        console2.log("hookCodeHash");
        console2.logBytes32(hookHash);
    }
}
