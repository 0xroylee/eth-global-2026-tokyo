// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Local/test faucet asset only. It does not model a production stablecoin.
contract MockUSD is ERC20 {
    constructor() ERC20("Mock USD", "mUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(address recipient, uint256 amount) external {
        require(recipient != address(0), "zero recipient");
        _mint(recipient, amount);
    }
}
