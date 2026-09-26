import { describe, expect, test } from "bun:test";
import {
  SAMPLE_POOLS,
  buildPoolStat,
  formatPrice,
  sqrtPriceX96ToPrice,
  type PoolRound,
} from "./poolMath";

const Q96 = 2n ** 96n;

const token = (symbol: string, decimals: number): PoolRound["hpToken"] => ({
  address: "0x0000000000000000000000000000000000000000",
  symbol,
  decimals,
});

const round = (overrides: Partial<PoolRound> = {}): PoolRound => ({
  bossHPCurrency0: true,
  hpToken: token("BHP", 18),
  rewardToken: token("mUSD", 18),
  bossCurrentSqrtPriceX96: Q96,
  encounterMode: "standalone",
  totalVolume: 0n,
  mockUSDInHook: 0n,
  ...overrides,
});

describe("sqrtPriceX96ToPrice", () => {
  test("2^96 encodes a price of 1.0", () => {
    expect(sqrtPriceX96ToPrice(Q96, 18, 18)).toBeCloseTo(1, 10);
  });

  test("doubling the sqrt price quadruples the price", () => {
    expect(sqrtPriceX96ToPrice(Q96 * 2n, 18, 18)).toBeCloseTo(4, 10);
  });

  test("resolves a known fractional price (sqrt 1.5 -> 2.25)", () => {
    expect(sqrtPriceX96ToPrice(3n * 2n ** 95n, 18, 18)).toBeCloseTo(2.25, 10);
  });

  test("applies the token decimal shift", () => {
    expect(sqrtPriceX96ToPrice(Q96, 18, 6)).toBeCloseTo(1e12, 2);
    expect(sqrtPriceX96ToPrice(Q96, 6, 18)).toBeCloseTo(1e-12, 22);
  });

  test("invert returns currency0 per currency1", () => {
    expect(sqrtPriceX96ToPrice(Q96 * 2n, 18, 18, true)).toBeCloseTo(0.25, 10);
  });

  test("returns 0 for a non-positive sqrt price", () => {
    expect(sqrtPriceX96ToPrice(0n, 18, 18)).toBe(0);
  });
});

describe("formatPrice", () => {
  test("sizes digits to the magnitude", () => {
    expect(formatPrice(1)).toBe("1.0000");
    expect(formatPrice(4)).toBe("4.0000");
    expect(formatPrice(0.5)).toBe("0.500000");
    expect(formatPrice(3200)).toBe("3,200");
  });

  test("returns a dash for a non-positive or invalid value", () => {
    expect(formatPrice(0)).toBe("—");
    expect(formatPrice(-1)).toBe("—");
    expect(formatPrice(Number.NaN)).toBe("—");
  });
});

describe("buildPoolStat", () => {
  test("returns a blank ledger when there is no live round", () => {
    const stat = buildPoolStat(undefined, null);
    expect(stat.poolLabel).toBe("Boss Pool");
    expect(stat.price).toBe("—");
    expect(stat.priceLive).toBe(false);
    expect(stat.volume).toBe("—");
    expect(stat.liquidity).toBe("—");
    expect(stat.source).toBe("chain");
  });

  test("labels and prices a standalone round from its own token metadata", () => {
    const stat = buildPoolStat(round(), null);
    expect(stat.poolLabel).toBe("BHP / mUSD");
    expect(stat.price).toBe("1.0000 mUSD");
    expect(stat.priceLive).toBe(true);
    // Standalone rounds carry no volume, so nothing is invented.
    expect(stat.volume).toBe("—");
    expect(stat.source).toBe("chain");
  });

  test("orientation follows bossHPCurrency0", () => {
    const stat = buildPoolStat(round({ bossHPCurrency0: false }), null);
    expect(stat.poolLabel).toBe("mUSD / BHP");
    expect(stat.price.endsWith(" BHP")).toBe(true);
  });

  test("derives the real ROY / BHP pair on the Factory path, ignoring the self-paired reward token", () => {
    // The SDK sets rewardToken = hpToken (both BHP) for Factory rounds; the resolved ROY
    // counter must win so the ledger never shows a self-pair. bossHPCurrency0=false → ROY is currency0.
    const stat = buildPoolStat(
      round({ encounterMode: "factory", bossHPCurrency0: false, rewardToken: token("BHP", 18) }),
      null,
      token("ROY", 18),
    );
    expect(stat.poolLabel).toBe("ROY / BHP");
    expect(stat.price.endsWith(" BHP")).toBe(true);
  });

  test("orients the Factory pair by bossHPCurrency0 with BHP as currency0", () => {
    const stat = buildPoolStat(
      round({ encounterMode: "factory", bossHPCurrency0: true, rewardToken: token("BHP", 18) }),
      null,
      token("ROY", 18),
    );
    expect(stat.poolLabel).toBe("BHP / ROY");
    expect(stat.price.endsWith(" ROY")).toBe(true);
  });

  test("applies the real pair decimals to the Factory price", () => {
    // ROY as a 6-decimal currency0 and BHP as an 18-decimal currency1 must shift by 10^(6-18).
    const stat = buildPoolStat(
      round({ encounterMode: "factory", bossHPCurrency0: false, rewardToken: token("BHP", 18), bossCurrentSqrtPriceX96: Q96 }),
      null,
      token("ROY", 6),
    );
    expect(stat.price).toBe(`${formatPrice(sqrtPriceX96ToPrice(Q96, 6, 18))} BHP`);
  });

  test("shows a neutral pool label instead of a self-pair when the counter token is unresolved", () => {
    const stat = buildPoolStat(
      round({ encounterMode: "factory", rewardToken: token("BHP", 18) }),
      null,
      null,
    );
    expect(stat.poolLabel).toBe("BHP pool");
    expect(stat.price).toBe("—");
  });

  test("falls back to a neutral pool label when both sides resolve to the same symbol", () => {
    const stat = buildPoolStat(
      round({ encounterMode: "factory", rewardToken: token("BHP", 18) }),
      null,
      token("BHP", 18),
    );
    expect(stat.poolLabel).toBe("BHP pool");
    expect(stat.price).toBe("—");
  });

  test("reports Factory volume in MockUSD and the stage liquidity", () => {
    const stat = buildPoolStat(
      round({ encounterMode: "factory", rewardToken: token("BHP", 18), totalVolume: 1234n * 10n ** 18n }),
      5n * 10n ** 18n,
      token("ROY", 18),
    );
    expect(stat.volume).toBe("1234 mUSD");
    expect(stat.liquidity).toBe("5 L");
  });

  test("falls back to the MockUSD-in-pool proxy when stage liquidity is unavailable", () => {
    const stat = buildPoolStat(round({ mockUSDInHook: 100n * 10n ** 18n }), null);
    expect(stat.liquidity).toBe("100 mUSD");
  });

  test("marks a missing live price without inventing one", () => {
    const stat = buildPoolStat(round({ bossCurrentSqrtPriceX96: 0n }), null);
    expect(stat.price).toBe("—");
    expect(stat.priceLive).toBe(false);
  });
});

describe("SAMPLE_POOLS integrity", () => {
  test("every ambient row is a marked sample with no verifiable identity", () => {
    expect(SAMPLE_POOLS.length).toBeGreaterThan(0);
    for (const pool of SAMPLE_POOLS) {
      expect(pool.source).toBe("sample");
      expect(pool.apr).toBe("sample");
      expect(pool.priceLive).toBe(false);
    }
    // No real addresses anywhere in the ambient board.
    expect(JSON.stringify(SAMPLE_POOLS).toLowerCase()).not.toContain("0x");
  });
});
