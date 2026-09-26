import roster from "./boss-roster.json";

/** Bosses the hub can open. Positions live on the Tiled marker layer. */
export type BossId = string;

/** Three-state availability. `locked` stays a data state until a gate uses it. */
export type BossStatus = "active" | "no-contract" | "locked";

/** Source rect of a portrait master plus the height the scene renders it at. */
export type BossCrop = { x: number; y: number; w: number; h: number; targetHeight: number };

/** One row of the curated Launch Boost snapshot. */
type RosterEntry = {
  id: string;
  ticker: string;
  name: string;
  tagline: string;
  rank: number;
  category: string;
  accent: string;
};

export type BossDefinition = {
  id: BossId;
  name: string;
  /** Name plate first line, drawn uppercase. */
  ticker: string;
  tagline: string;
  /** Portrait image under /public/images. Empty when there is no portrait. */
  portrait: string;
  /** Where to crop the portrait master. `null` means the scene draws a ticker shield. */
  crop: BossCrop | null;
  /** Availability. `locked` mirrors this for callers that predate the field. */
  status: BossStatus;
  /**
   * @deprecated Kept so the partner-owned `BossEntryPanel` eyebrow reads the same value as
   * before. Must mirror `status`; guarded by `bosses.test.ts`. Delete once that panel
   * reads `status`.
   */
  locked: boolean;
  /** Gate glow and name plate stroke colour, as a hex string. */
  accent: string;
  /** `chain` has contract semantics behind it; `venue` is a showcase entry. */
  source: "chain" | "venue";
  /** Launch Boost snapshot fields. Only roster gates carry them. */
  rosterMeta?: {
    rank: number;
    chain: string;
    category: string;
    snapshot: string;
  };
};

/** Gates that predate the roster: one playable, one fixture that has a portrait. */
const CORE_BOSSES: readonly BossDefinition[] = [
  {
    id: "cat",
    name: "Roy",
    ticker: "ROY",
    tagline: "The evolving cat. Three forms, one pool.",
    portrait: "/images/boss-cat-form-a.png",
    crop: { x: 120, y: 60, w: 880, h: 1240, targetHeight: 28 },
    status: "active",
    locked: false,
    accent: "#f5b04a",
    source: "chain",
  },
  {
    id: "macro-whale",
    name: "Macro Whale",
    ticker: "WHALE",
    tagline: "Moves markets with a single splash.",
    portrait: "/images/boss-macro-whale-portrait.png",
    crop: { x: 160, y: 80, w: 940, h: 940, targetHeight: 28 },
    status: "no-contract",
    locked: false,
    accent: "#5aa9ff",
    source: "venue",
  },
];

/** Roster gates have no portrait and no contract: the card is the whole experience. */
function toDefinition(entry: RosterEntry): BossDefinition {
  return {
    id: entry.id,
    name: entry.name,
    ticker: entry.ticker,
    tagline: entry.tagline,
    portrait: "",
    crop: null,
    status: "no-contract",
    locked: false,
    accent: entry.accent,
    source: "venue",
    rosterMeta: {
      rank: entry.rank,
      chain: "Robinhood",
      category: entry.category,
      snapshot: `GeckoTerminal trending · ${roster.snapshotDate}`,
    },
  };
}

export const BOSSES: readonly BossDefinition[] = [...CORE_BOSSES, ...roster.bosses.map(toDefinition)];

const BOSS_IDS: ReadonlySet<string> = new Set(BOSSES.map((boss) => boss.id));

export function findBoss(id: BossId): BossDefinition {
  const boss = BOSSES.find((b) => b.id === id);
  if (!boss) throw new Error(`Unknown boss ${id}`);
  return boss;
}

export function isBossId(value: unknown): value is BossId {
  return typeof value === "string" && BOSS_IDS.has(value);
}
