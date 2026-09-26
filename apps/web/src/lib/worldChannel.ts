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

/**
 * Pseudo-handles: readable, never a 0x address, never a real known wallet. Integrity boundary —
 * mock rows must not masquerade as verifiable on-chain identities.
 */
export const MOCK_HANDLES = [
  "pixel_roy", "garden_ghost", "stage3_slayer", "royraider", "hodl_knight", "mockwhale",
  "sprite_hunter", "chain_cat", "boss_bane", "leek_lord", "usdc_samurai", "block_wraith",
] as const;

type MockTemplate = { templateId: string; kind: WorldChannelKind; build: (handle: string, rng: () => number) => string };

/** Ambient / achievement / milestone / join only. Never a lifecycle kind (see §3.4 integrity guard). */
const MOCK_CATALOG: readonly MockTemplate[] = [
  { templateId: "m-attack", kind: "attack", build: (h, r) => `${h} struck · ≈ ${mockHp(r)} HP` },
  { templateId: "m-victory", kind: "victory-nft", build: (h) => `${h} claimed a Victory NFT` },
  { templateId: "m-reward", kind: "reward", build: (h, r) => `${h} redeemed ≈ ${mockHp(r)} HP` },
  { templateId: "m-join", kind: "join", build: (h) => `${h} joined the hunt` },
  { templateId: "a-streak", kind: "achievement", build: (h, r) => `${h} is on a ${2 + Math.floor(r() * 6)}-attack streak!` },
  { templateId: "a-firststrike", kind: "achievement", build: (h) => `${h} landed the first strike of the hour` },
  { templateId: "a-bighit", kind: "achievement", build: (h, r) => `${h} dealt a massive ${mockHp(r)} HP blow` },
  { templateId: "m-ladder", kind: "milestone", build: (h, r) => `${h} climbed to #${1 + Math.floor(r() * 20)} on the ladder` },
];

function mockHp(rng: () => number): string {
  return (1 + rng() * 39).toFixed(2);
}

/** mulberry32: a tiny pure PRNG so the mock stream is reproducible under test. */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Same `(seed, count)` → deep-equal output. Every row is `source: "mock"`, carries no explorer link,
 * and uses a pseudo-handle actor. `timestamp` is a placeholder the hook re-stamps at injection time.
 */
export function generateMockEvents(seed: number, count: number): WorldChannelEvent[] {
  const rng = createSeededRng(seed);
  const events: WorldChannelEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    const template = MOCK_CATALOG[Math.floor(rng() * MOCK_CATALOG.length)]!;
    const handle = MOCK_HANDLES[Math.floor(rng() * MOCK_HANDLES.length)]!;
    events.push({
      id: `mock:${seed}:${index}`,
      kind: template.kind,
      actor: handle,
      message: template.build(handle, rng),
      timestamp: 0,
      source: "mock",
    });
  }
  return events;
}

/** Injection cadence in [3000, 8000) ms so the ambient stream never looks metronomic. */
export function mockIntervalMs(rng: () => number): number {
  return 3_000 + Math.floor(rng() * 5_000);
}
