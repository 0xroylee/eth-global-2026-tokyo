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
  /** "ROY / BHP" — currency0 / currency1 of the boss pool, oriented by bossHPCurrency0. */
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

/** The identity a pool token contributes to the ledger: its symbol and decimals. */
export type PoolToken = Pick<RoundSnapshot["hpToken"], "symbol" | "decimals">;

/**
 * Assemble the pool view model from an already-polled round snapshot, the supplementary
 * stage liquidity, and — on the Factory path — the resolved counter token (ROY). Pure:
 * no RPC, no React, fully testable.
 *
 * The boss pool always holds BossHP (`hpToken`) on one side. The other side depends on
 * the encounter: Factory rounds set `rewardToken = hpToken` (both BossHP), so the real
 * counter, ROY, must arrive via `attackToken`; standalone rounds already pair BossHP with
 * their MockUSD reward, so `rewardToken` is the true counter. Orientation (currency0 /
 * currency1) follows the snapshot's `bossHPCurrency0` flag, so decimals and price stay
 * correct for any pair. If the counter cannot be resolved, or both sides share a symbol,
 * the ledger shows a neutral "<SYMBOL> pool" label rather than a self-pair.
 */
export function buildPoolStat(
  round: PoolRound | undefined,
  stageLiquidity: StageLiquidity,
  attackToken?: PoolToken | null,
): PoolStat {
  if (!round) return EMPTY_STAT;
  const bhp = round.hpToken;
  const counter: PoolToken | null = round.encounterMode === "factory" ? attackToken ?? null : round.rewardToken;
  // base = currency0, quote = currency1, so the price's `decimals0 - decimals1` stays
  // correct for any pair. A missing or self-symbol counter collapses to a neutral label.
  const { base, quote }: { base: PoolToken; quote: PoolToken | null } =
    counter !== null && counter.symbol !== bhp.symbol
      ? round.bossHPCurrency0
        ? { base: bhp, quote: counter }
        : { base: counter, quote: bhp }
      : { base: bhp, quote: null };
  const priceLive = round.bossCurrentSqrtPriceX96 > 0n;
  const price =
    priceLive && quote
      ? `${formatPrice(sqrtPriceX96ToPrice(round.bossCurrentSqrtPriceX96, base.decimals, quote.decimals))} ${quote.symbol}`
      : "—";
  // totalVolume is denominated in MockUSD (BossHook.totalVolume), independent of the pair.
  const volume =
    round.encounterMode === "factory" && round.totalVolume > 0n
      ? `${displayEstimate(round.totalVolume, 18, 2)} mUSD`
      : "—";
  const liquidity =
    stageLiquidity !== null
      ? `${displayEstimate(stageLiquidity, 18, 2)} L`
      : round.mockUSDInHook > 0n
        ? `${displayEstimate(round.mockUSDInHook, 18, 2)} mUSD`
        : "—";
  return {
    poolLabel: quote ? `${base.symbol} / ${quote.symbol}` : `${bhp.symbol} pool`,
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
