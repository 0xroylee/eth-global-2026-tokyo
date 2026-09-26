// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "v4-core/src/libraries/FullMath.sol";
import {SqrtPriceMath} from "v4-core/src/libraries/SqrtPriceMath.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {TickBitmap} from "v4-core/src/libraries/TickBitmap.sol";

/// @notice Price quotes shared by BossHook and the permissionless factory.
library BossPricing {
    uint24 internal constant SWAP_FEE = 3_000;
    int24 internal constant TICK_SPACING = 60;
    int24 internal constant MIN_START_TICK = -887_220;
    int24 internal constant MAX_START_TICK = 885_300;
    uint256 private constant Q96 = 1 << 96;
    uint256 private constant Q128 = 1 << 128;
    uint256 private constant FEE_DENOMINATOR = 1_000_000;

    error InvalidPrice();

    function maxRoyPerMockUSDX128(uint160 sqrtPriceX96, bool mockUSDIsCurrency0) internal pure returns (uint256 rate) {
        uint256 spotX128 = FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
        rate = mockUSDIsCurrency0 ? spotX128 : FullMath.mulDiv(Q128, Q128, spotX128);
        rate = FullMath.mulDivRoundingUp(rate, 11_000, 10_000);
    }

    function startTickForVolume(uint256 volume, uint256 battleTokenBudget, uint256 maxRoyPerMockUSD)
        internal
        pure
        returns (int24 startTick)
    {
        if (volume == 0 || battleTokenBudget == 0 || maxRoyPerMockUSD == 0) revert InvalidPrice();
        uint256 minimumPriceX128 = FullMath.mulDivRoundingUp(volume, maxRoyPerMockUSD, battleTokenBudget);
        int256 low = MIN_START_TICK / TICK_SPACING;
        int256 high = MAX_START_TICK / TICK_SPACING;
        if (_priceX128(MAX_START_TICK) < minimumPriceX128) revert InvalidPrice();

        while (low < high) {
            int256 middle = low + (high - low) / 2;
            if (_priceX128(int24(middle * TICK_SPACING)) < minimumPriceX128) low = middle + 1;
            else high = middle;
        }
        startTick = int24(low * TICK_SPACING);
    }

    function liquidityForHP(uint256 amount, uint160 sqrtLowerX96, uint160 sqrtUpperX96, bool bossIsCurrency0)
        internal
        pure
        returns (uint128)
    {
        uint256 value;
        if (bossIsCurrency0) {
            uint256 intermediate = FullMath.mulDiv(sqrtLowerX96, sqrtUpperX96, Q96);
            value = FullMath.mulDiv(amount, intermediate, sqrtUpperX96 - sqrtLowerX96);
        } else {
            value = FullMath.mulDiv(amount, Q96, sqrtUpperX96 - sqrtLowerX96);
        }
        if (value == 0 || value > type(uint128).max) revert InvalidPrice();
        return uint128(value);
    }

    function hpAmountForLiquidity(uint160 sqrtLowerX96, uint160 sqrtUpperX96, uint128 liquidity, bool bossIsCurrency0)
        internal
        pure
        returns (uint256)
    {
        return bossIsCurrency0
            ? SqrtPriceMath.getAmount0Delta(sqrtLowerX96, sqrtUpperX96, liquidity, true)
            : SqrtPriceMath.getAmount1Delta(sqrtLowerX96, sqrtUpperX96, liquidity, true);
    }

    function initialBattleTokenFunding(uint256 saleBudget, int24 startTick, bool bossIsCurrency0)
        internal pure returns (uint256)
    {
        uint160 lower = TickMath.getSqrtPriceAtTick(bossIsCurrency0 ? startTick : -(startTick + 1_920));
        uint160 upper = TickMath.getSqrtPriceAtTick(bossIsCurrency0 ? startTick + 1_920 : -startTick);
        return hpAmountForLiquidity(lower, upper, liquidityForHP(saleBudget, lower, upper, bossIsCurrency0), bossIsCurrency0);
    }

    function minimumBattleTokenFunding(uint256 stageOneHP, int24 startTick, bool bossIsCurrency0)
        internal
        pure
        returns (uint256 total)
    {
        int24 lowerTick = bossIsCurrency0 ? startTick : -(startTick + 1_920);
        int24 upperTick = bossIsCurrency0 ? startTick + 1_920 : -startTick;
        uint160 lower = TickMath.getSqrtPriceAtTick(lowerTick);
        uint160 upper = TickMath.getSqrtPriceAtTick(upperTick);
        uint128 first = liquidityForHP(stageOneHP, lower, upper, bossIsCurrency0);
        uint128 second = liquidityForHP(stageOneHP * 2, lower, upper, bossIsCurrency0);
        uint128 third = liquidityForHP(stageOneHP * 3, lower, upper, bossIsCurrency0);
        total = hpAmountForLiquidity(lower, upper, first, bossIsCurrency0);
        total += _rangeInput(lower, upper, first, bossIsCurrency0);
        total += hpAmountForLiquidity(lower, upper, second - first, bossIsCurrency0);
        total += _rangeInput(lower, upper, second, bossIsCurrency0);
        total += hpAmountForLiquidity(lower, upper, third - second, bossIsCurrency0);
    }

    function stageRoyInputRequirement(bool bossIsCurrency0, int24 lowerTick, int24 upperTick, uint128 liquidity)
        internal
        pure
        returns (uint256)
    {
        return _rangeInput(
            TickMath.getSqrtPriceAtTick(lowerTick), TickMath.getSqrtPriceAtTick(upperTick), liquidity, !bossIsCurrency0
        );
    }

    function stageRoyInputRequirement(uint160 lower, uint160 upper, uint128 liquidity, bool token0In)
        internal
        pure
        returns (uint256)
    {
        return _rangeInput(lower, upper, liquidity, token0In);
    }

    function _priceX128(int24 tick) private pure returns (uint256) {
        uint160 sqrtPriceX96 = TickMath.getSqrtPriceAtTick(tick);
        return FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, 1 << 64);
    }

    function _rangeInput(uint160 lower, uint160 upper, uint128 liquidity, bool token0In)
        private
        pure
        returns (uint256)
    {
        int24 lowerTick = TickMath.getTickAtSqrtPrice(lower);
        int24 upperTick = TickMath.getTickAtSqrtPrice(upper);
        int24 lowerCompressed = TickBitmap.compress(lowerTick, TICK_SPACING);
        int24 upperCompressed = TickBitmap.compress(upperTick, TICK_SPACING);
        int24 wordPos = token0In ? upperCompressed >> 8 : (lowerCompressed + 1) >> 8;
        int24 splitTick = token0In
            ? wordPos * 256 * TICK_SPACING
            : (wordPos * 256 + 255) * TICK_SPACING;
        if (splitTick > lowerTick && splitTick <= upperTick) {
            uint160 splitPrice = TickMath.getSqrtPriceAtTick(splitTick);
            if (splitPrice > lower && splitPrice < upper) {
                return _stepInput(lower, splitPrice, liquidity, token0In)
                    + _stepInput(splitPrice, upper, liquidity, token0In);
            }
        }
        return _stepInput(lower, upper, liquidity, token0In);
    }

    function _stepInput(uint160 lower, uint160 upper, uint128 liquidity, bool token0In)
        private
        pure
        returns (uint256)
    {
        uint256 netInput = token0In
            ? SqrtPriceMath.getAmount0Delta(lower, upper, liquidity, true)
            : SqrtPriceMath.getAmount1Delta(lower, upper, liquidity, true);
        return FullMath.mulDivRoundingUp(netInput, FEE_DENOMINATOR, FEE_DENOMINATOR - SWAP_FEE);
    }
}
