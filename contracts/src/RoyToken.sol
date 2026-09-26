// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply ROY. Its constructor is the only mint path.
contract RoyToken is ERC20 {
    constructor(address initialHolder, uint256 initialSupply) ERC20("ROY", "ROY") {
        require(initialHolder != address(0), "zero holder");
        _mint(initialHolder, initialSupply);
    }
}
