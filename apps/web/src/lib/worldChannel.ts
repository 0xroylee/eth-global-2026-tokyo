import { ROBINHOOD_TESTNET_CHAIN_ID, type ActivityEntry } from "@boss-pool/chain";
import { displayEstimate } from "./format";

/**
 * Semantic row type. `kind` carries the event meaning; `source` carries credibility.
 * The same `attack` can be real or mock, but lifecycle kinds (boss-defeated / stage-cleared)
 * are chain-only so the ambient mock stream can never contradict the real round state.
 */
export type WorldChannelKind =
  | "attack"
  | "victory-nft"
  | "reward"
  | "boss-defeated"
  | "stage-cleared"
  | "achievement"
  | "milestone"
  | "join";

export type WorldChannelSource = "chain" | "mock";

export type WorldChannelEvent = {
  id: string;
  kind: WorldChannelKind;
  actor: string;
  message: string;
  /** ms epoch. chain = blockTimestamp * 1000; mock = injection time stamped by the hook. */
  timestamp: number;
  source: WorldChannelSource;
  /** chain rows only: `${explorer}/tx/${hash}`. Mock rows never carry a link. */
  explorerUrl?: string;
  /** chain rows only: drives the rescanned-window merge that keeps overlapping polls duplicate-free. */
  blockNumber?: bigint;
};

export type WorldChannelMode = "blended" | "blended-degraded" | "mock-only";

/** Context the real formatter needs, sourced from the live deployment (never from user input). */
export type WorldEventContext = {
  explorer?: string;
  hpDecimals: number;
  hpSymbol: string;
};

/** Only these on-chain kinds surface in the feed; everything else is internal or duplicate noise. */
const SURFACED_KINDS: ReadonlySet<ActivityEntry["kind"]> = new Set<ActivityEntry["kind"]>([
  "attack",
  "boss-defeated",
  "stage-cleared",
  "victory-nft-claimed",
  "reward-claimed",
]);

export function truncateActor(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Map a raw on-chain entry to a feed row, or null when the kind is not surfaced. */
export function toWorldEvent(entry: ActivityEntry, ctx: WorldEventContext): WorldChannelEvent | null {
  if (!SURFACED_KINDS.has(entry.kind)) return null;
  const base = {
    id: entry.id,
    timestamp: Number(entry.blockTimestamp) * 1_000,
    source: "chain" as const,
    blockNumber: entry.blockNumber,
    ...(ctx.explorer ? { explorerUrl: `${ctx.explorer}/tx/${entry.transactionHash}` } : {}),
  };
  switch (entry.kind) {
    case "attack":
      return { ...base, kind: "attack", actor: truncateActor(entry.player),
        message: `struck · ≈ ${displayEstimate(entry.bossHPReceived, ctx.hpDecimals)} ${ctx.hpSymbol}` };
    case "reward-claimed":
      return { ...base, kind: "reward", actor: truncateActor(entry.player),
        message: `redeemed ≈ ${displayEstimate(entry.bossHPIn, ctx.hpDecimals)} ${ctx.hpSymbol}` };
    case "victory-nft-claimed":
      return { ...base, kind: "victory-nft", actor: truncateActor(entry.player), message: "claimed a Victory NFT" };
    case "boss-defeated":
      return { ...base, kind: "boss-defeated", actor: "—", message: "The boss has fallen!" };
    case "stage-cleared":
      return { ...base, kind: "stage-cleared", actor: "—", message: `Stage ${entry.stage + 1} cleared!` };
    default:
      return null;
  }
}

/**
 * Fallback selector (§3.5). Pure over primitives so it is trivial to unit test.
 * Not live / historical Robinhood chain → mock-only; a live poll error degrades but keeps prior real rows.
 */
export function selectMode(input: { live: boolean; chainId?: number; realErrored: boolean }): WorldChannelMode {
  if (!input.live) return "mock-only";
  if (input.chainId === ROBINHOOD_TESTNET_CHAIN_ID) return "mock-only";
  return input.realErrored ? "blended-degraded" : "blended";
}
