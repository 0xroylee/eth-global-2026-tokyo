// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Owner-controlled testnet demonstration price. This is not a market feed.
contract MockBossPriceSource is Ownable {
    address public immutable bossToken;
    address public immutable mockUSD;
    uint256 public initialPriceX128;
    uint256 public priceX128;
    uint256 public updatedAt;
    error InvalidMockPrice();
    event MockPriceUpdated(address indexed owner, uint256 priceX128, uint256 updatedAt);

    constructor(address bossToken_, address mockUSD_, address owner_) Ownable(owner_) {
        if (bossToken_.code.length == 0 || mockUSD_.code.length == 0 || bossToken_ == mockUSD_) revert InvalidMockPrice();
        bossToken = bossToken_; mockUSD = mockUSD_;
    }

    /// @notice Freeze the demo's reset reference after quoting its newly launched pool.
    function setInitialPrice(uint256 price) external onlyOwner {
        if (initialPriceX128 != 0) revert InvalidMockPrice();
        initialPriceX128 = price;
        _setPrice(price);
    }

    /// @notice Refresh or change the demo price using the actual chain timestamp.
    function setPrice(uint256 price) external onlyOwner { _setPrice(price); }

    function _setPrice(uint256 price) private {
        if (price == 0) revert InvalidMockPrice();
        priceX128 = price; updatedAt = block.timestamp;
        emit MockPriceUpdated(msg.sender, price, block.timestamp);
    }
    function readPrice() external view returns (uint256, uint256) { return (priceX128, updatedAt); }
}
