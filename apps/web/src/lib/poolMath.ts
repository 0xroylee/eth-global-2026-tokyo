import type { RoundSnapshot } from "@boss-pool/chain";
import { displayEstimate } from "./format";

/**
 * Human price of currency0 denominated in currency1 for a Uniswap v4 pool.
 *
 * `sqrtPriceX96` encodes `sqrt(currency1_raw / currency0_raw) * 2^96`, so the raw
 * price is `(sqrtPriceX96 / 2^96)^2`. The decimal shift converts raw units to human
 * units. Kept in bigint up to the final divide so typical prices stay exact.
 * `invert` returns currency0-per-currency1 instead.
 */
export function sqrtPriceX96ToPrice(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
  invert = false,
): number {
  if (sqrtPriceX96 <= 0n) return 0;
  const scaled = (sqrtPriceX96 * sqrtPriceX96 * 10n ** 18n) >> 192n;
  const raw = Number(scaled) / 1e18;
  const price = raw * 10 ** (decimals0 - decimals1);
  if (invert) return price === 0 ? 0 : 1 / price;
  return price;
}

/** Compact price label sized to its magnitude. Returns "—" for a non-positive price. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000) return Math.round(value).toLocaleString("en-US");
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.0001) return value.toFixed(6);
  return value.toExponential(2);
}

export type PoolStatSource = "chain" | "sample";

export type PoolStat = {
  /** "BHP / mUSD" — currency0 / currency1 from the deployment's own token metadata. */
  poolLabel: string;
  /** Price of currency0 in currency1, or "—" when the round has no live price. */
  price: string;
  priceLive: boolean;
  /** Cumulative volume (Factory rounds only); "—" for standalone so nothing is invented. */
  volume: string;
  /** Current stage liquidity (L) when readable, else the MockUSD-in-pool proxy, else "—". */
  liquidity: string;
  /** Always marked est./sample — never presented as a real USD yield. */
  apr: string;
  source: PoolStatSource;
};

const EMPTY_STAT: PoolStat = {
  poolLabel: "Boss Pool",
  price: "—",
  priceLive: false,
  volume: "—",
  liquidity: "—",
  apr: "—",
  source: "chain",
};

/** Current stage liquidity read from the hook, or `null` when it could not be read. */
export type StageLiquidity = bigint | null;

/** The round fields the pool view model actually reads. A full snapshot satisfies it. */
export type PoolRound = Pick<
  RoundSnapshot,
  "bossHPCurrency0" | "hpToken" | "rewardToken" | "bossCurrentSqrtPriceX96" | "encounterMode" | "totalVolume" | "mockUSDInHook"
>;

/**
 * Assemble the pool view model from an already-polled round snapshot and the one
 * supplementary field the snapshot omits. Pure: no RPC, no React, fully testable.
 * Token labels and decimals come from the deployment's own metadata, so the pair
 * shown is always the real pool pair rather than a hard-coded guess.
 */
export function buildPoolStat(round: PoolRound | undefined, stageLiquidity: StageLiquidity): PoolStat {
  if (!round) return EMPTY_STAT;
  const base = round.bossHPCurrency0 ? round.hpToken : round.rewardToken;
  const quote = round.bossHPCurrency0 ? round.rewardToken : round.hpToken;
  const priceLive = round.bossCurrentSqrtPriceX96 > 0n;
  const price = priceLive
    ? `${formatPrice(sqrtPriceX96ToPrice(round.bossCurrentSqrtPriceX96, base.decimals, quote.decimals))} ${quote.symbol}`
    : "—";
  const volume =
    round.encounterMode === "factory" && round.totalVolume > 0n
      ? `${displayEstimate(round.totalVolume, quote.decimals, 2)} ${quote.symbol}`
      : "—";
  const liquidity =
    stageLiquidity !== null
      ? `${displayEstimate(stageLiquidity, 18, 2)} L`
      : round.mockUSDInHook > 0n
        ? `${displayEstimate(round.mockUSDInHook, 18, 2)} mUSD`
        : "—";
  return {
    poolLabel: `${base.symbol} / ${quote.symbol}`,
    price,
    priceLive,
    volume,
    liquidity,
    apr: "est.",
    source: "chain",
  };
}

/**
 * Ambient sample pools for the ledger's lower board. Deliberately not live: no real
 * addresses, no explorer links, apr marked "sample". Mirrors the World Channel's mock
 * discipline so nothing here can be mistaken for a verifiable on-chain position.
 */
export const SAMPLE_POOLS: readonly PoolStat[] = [
  { poolLabel: "ETH / USDC", price: "3,200 USDC", priceLive: false, volume: "1.2M", liquidity: "4.8M", apr: "sample", source: "sample" },
  { poolLabel: "cbBTC / USDC", price: "64,000 USDC", priceLive: false, volume: "820K", liquidity: "3.1M", apr: "sample", source: "sample" },
  { poolLabel: "AERO / ETH", price: "0.00042 ETH", priceLive: false, volume: "160K", liquidity: "540K", apr: "sample", source: "sample" },
];
