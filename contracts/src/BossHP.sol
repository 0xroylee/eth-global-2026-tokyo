// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply reward-right token. There is no post-construction mint or burn path.
contract BossHP is ERC20 {
    constructor(address initialHolder, uint256 initialSupply) ERC20("Boss HP", "BHP") {
        require(initialHolder != address(0), "zero holder");
        _mint(initialHolder, initialSupply);
    }
}
