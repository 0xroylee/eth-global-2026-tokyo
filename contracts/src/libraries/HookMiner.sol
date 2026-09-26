// SPDX-License-Identifier: MIT
// Vendored from Uniswap/v4-hooks-public, commit e4eabe526f9b516fff78d98ba781251747f0fd6e.
// Copyright (c) 2026 Universal Navigation Inc.
pragma solidity ^0.8.26;

import {Hooks} from "v4-core/src/libraries/Hooks.sol";

/// @notice Mines CREATE2 salts for the requested v4 hook permission flags.
/// @dev Source: https://github.com/Uniswap/v4-hooks-public/blob/e4eabe526f9b516fff78d98ba781251747f0fd6e/src/utils/HookMiner.sol
library HookMiner {
    uint160 internal constant FLAG_MASK = Hooks.ALL_HOOK_MASK;
    uint256 internal constant MAX_LOOP = 160_444;

    function find(address deployer, uint160 flags, bytes memory creationCode, bytes memory constructorArgs)
        internal
        view
        returns (address hookAddress, bytes32 salt)
    {
        flags &= FLAG_MASK;
        bytes memory creationCodeWithArgs = abi.encodePacked(creationCode, constructorArgs);
        for (uint256 i; i < MAX_LOOP; i++) {
            hookAddress = computeAddress(deployer, i, creationCodeWithArgs);
            if (uint160(hookAddress) & FLAG_MASK == flags && hookAddress.code.length == 0) {
                return (hookAddress, bytes32(i));
            }
        }
        revert("HookMiner: could not find salt");
    }

    function computeAddress(address deployer, uint256 salt, bytes memory creationCodeWithArgs)
        internal
        pure
        returns (address hookAddress)
    {
        hookAddress = address(
            uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), deployer, salt, keccak256(creationCodeWithArgs)))))
        );
    }
}
