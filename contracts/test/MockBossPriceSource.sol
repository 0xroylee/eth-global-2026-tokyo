// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;
import {MockBossPriceSource} from "../src/MockBossPriceSource.sol";
/// @notice Invalid-price/timestamp injection is confined to tests.
contract MockBossPriceSourceHarness is MockBossPriceSource {
    constructor(address bossToken_, address mockUSD_, address owner_) MockBossPriceSource(bossToken_, mockUSD_, owner_) {}
    function setPriceAt(uint256 price, uint256 timestamp) external onlyOwner { priceX128 = price; updatedAt = timestamp; }
}
