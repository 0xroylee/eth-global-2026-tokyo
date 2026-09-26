// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "v4-core/src/libraries/FullMath.sol";

interface IBossPriceSource {
    function bossToken() external view returns (address);
    function mockUSD() external view returns (address);
    function readPrice() external view returns (uint256 priceX128, uint256 updatedAt);
}

/// @notice Pair-bound fee controller. A mock source is a demonstration referencePrice, not a market price guarantee.
contract BossFeeController {
    uint256 private constant D = 1_000_000;
    uint24 public constant BASE_FEE = 3_000;
    address public immutable bossToken;
    address public immutable mockUSD;
    address public immutable attackToken;
    IBossPriceSource public immutable source;
    uint256 public immutable maxAge;
    uint24 public immutable maxFee;
    error InvalidOracle();
    error FeeAboveMaximum(uint256 required, uint24 maximum);

    constructor(address bossToken_, address mockUSD_, address attackToken_, IBossPriceSource source_, uint256 maxAge_, uint24 maxFee_) {
        if (bossToken_.code.length == 0 || mockUSD_.code.length == 0 || attackToken_.code.length == 0
            || address(source_).code.length == 0 || bossToken_ == mockUSD_ || bossToken_ == attackToken_ || mockUSD_ == attackToken_
            || source_.bossToken() != bossToken_ || source_.mockUSD() != mockUSD_ || maxAge_ == 0 || maxFee_ < BASE_FEE || maxFee_ >= D) revert InvalidOracle();
        bossToken = bossToken_; mockUSD = mockUSD_; attackToken = attackToken_; source = source_; maxAge = maxAge_; maxFee = maxFee_;
    }

    /// @dev Prices are Q128 MockUSD raw units per boss raw unit; routing amounts are the measured first-hop amounts.
    function feeForSwap(uint160 bossSqrtPriceX96, uint256 mockUSDSpent, uint256 attackBought) external view returns (uint24) {
        (uint256 referencePrice, uint256 updatedAt) = source.readPrice();
        if (referencePrice == 0 || updatedAt == 0 || updatedAt > block.timestamp || block.timestamp - updatedAt > maxAge
            || mockUSDSpent == 0 || attackBought == 0 || bossSqrtPriceX96 == 0) revert InvalidOracle();
        uint256 ratio = FullMath.mulDiv(bossSqrtPriceX96, bossSqrtPriceX96, 1 << 64);
        if (ratio == 0) revert InvalidOracle();
        uint256 attackPerBoss = bossToken < attackToken ? ratio : FullMath.mulDiv(1 << 128, 1 << 128, ratio);
        uint256 poolPrice = FullMath.mulDiv(attackPerBoss, mockUSDSpent, attackBought);
        // Detect the zero-fee region before division, avoiding overflow for very expensive pools.
        if (poolPrice >= referencePrice && poolPrice - referencePrice >= FullMath.mulDivRoundingUp(referencePrice, BASE_FEE, D - BASE_FEE)) return 0;
        uint256 discounted = FullMath.mulDiv(D - BASE_FEE, poolPrice, referencePrice);
        uint256 required = discounted >= D ? 0 : D - discounted;
        if (required > maxFee) revert FeeAboveMaximum(required, maxFee);
        return uint24(required);
    }
}
