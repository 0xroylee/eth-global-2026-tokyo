import { getAddress, isAddress } from "viem";
import { parseBaseSepoliaDeployment, type Address } from "@boss-pool/chain";
import roster from "./boss-roster.json";
import macroWhaleManifest from "../../public/deployments/base-sepolia-macro-whale.json";

const macroWhaleDeployment = parseBaseSepoliaDeployment(macroWhaleManifest);

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

export type BossPresentation = {
  name: string;
  japaneseName?: string;
  stageImages: readonly [string, string, string];
  stageVisibleBounds?: readonly [BossImageBounds, BossImageBounds, BossImageBounds];
};

/** Source canvas and exclusive alpha bounds for artwork rendered at a fixed visible height. */
export type BossImageBounds = { sourceWidth: number; sourceHeight: number; x: number; y: number; width: number; height: number; clip?: boolean };

/** Shared face for every gate that has no contract behind it. */
export const HIDDEN_BOSS_PORTRAIT = "/images/boss-hidden-crowned-shadow-master.png";

/** Crop of the crowned figure on the 1254² master, sized like the other gate portraits. */
export const HIDDEN_BOSS_CROP: BossCrop = { x: 150, y: 70, w: 980, h: 1060, targetHeight: 28 };

export const POOL_UNIS_PRESENTATION: BossPresentation = {
  name: "Pool Unis",
  japaneseName: "プール・ユニス",
  stageImages: [
    "/images/boss-cat-form-a.png?v=6",
    "/images/boss-cat-form-b.png?v=6",
    "/images/boss-cat-form-c.png?v=8",
  ],
  stageVisibleBounds: [
    { sourceWidth: 819, sourceHeight: 1024, x: 203, y: 98, width: 510, height: 869 },
    { sourceWidth: 1024, sourceHeight: 847, x: 364, y: 11, width: 344, height: 812 },
    { sourceWidth: 374, sourceHeight: 667, x: 84, y: 19, width: 256, height: 606 },
  ],
};

const MACRO_WHALE_PORTRAIT = "/images/boss-macro-whale-portrait.png";
const MACRO_WHALE_BOUNDS: BossImageBounds = { sourceWidth: 1254, sourceHeight: 1254, x: 133, y: 205, width: 1058, height: 791, clip: true };
export const MACRO_WHALE_PRESENTATION: BossPresentation = {
  name: "Macro Whale",
  japaneseName: "マクロ・ホエール",
  stageImages: [MACRO_WHALE_PORTRAIT, MACRO_WHALE_PORTRAIT, MACRO_WHALE_PORTRAIT],
  stageVisibleBounds: [MACRO_WHALE_BOUNDS, MACRO_WHALE_BOUNDS, MACRO_WHALE_BOUNDS],
};

/** A presentation is a checked-in choice for one chain and Hook; it never verifies a contract. */
const BOSS_PRESENTATIONS: Readonly<Record<string, BossPresentation>> = {
  "84532:0x1df6674f1c6b18d9c1b3df2480093ac831816ac0": POOL_UNIS_PRESENTATION,
  [`${macroWhaleDeployment.chainId}:${macroWhaleDeployment.addresses.hook.toLowerCase()}`]: MACRO_WHALE_PRESENTATION,
};

export function findBossPresentation(chainId: number, hookAddress: string, localDefaultHookAddress?: string): BossPresentation | undefined {
  if (!isAddress(hookAddress, { strict: false })) return undefined;
  const normalized = getAddress(hookAddress.toLowerCase()).toLowerCase();
  if (chainId === 31337 && localDefaultHookAddress && isAddress(localDefaultHookAddress, { strict: false }) &&
      normalized === getAddress(localDefaultHookAddress.toLowerCase()).toLowerCase()) return POOL_UNIS_PRESENTATION;
  return BOSS_PRESENTATIONS[`${chainId}:${normalized}`];
}

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
  /** A specific encounter; omitted when the gate uses the selected network's default. */
  deployment?: { chainId: number; hookAddress: Address };
  /** Launch Boost snapshot fields. Only roster gates carry them. */
  rosterMeta?: {
    rank: number;
    chain: string;
    category: string;
    snapshot: string;
  };
};

/** The two playable gates that predate the roster. */
const CORE_BOSSES: readonly BossDefinition[] = [
  {
    id: "cat",
    name: "Pool Unis",
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
    tagline: "Three volume goals. A separate pool and prize.",
    portrait: MACRO_WHALE_PORTRAIT,
    crop: { x: 133, y: 205, w: 1058, h: 791, targetHeight: 28 },
    status: "active",
    locked: false,
    accent: "#5aa9ff",
    source: "chain",
    deployment: { chainId: macroWhaleDeployment.chainId, hookAddress: macroWhaleDeployment.addresses.hook },
  },
];

/** Roster gates have no portrait and no contract: the card is the whole experience. */
function toDefinition(entry: RosterEntry): BossDefinition {
  return {
    id: entry.id,
    name: "Hidden Boss",
    ticker: "HIDDEN",
    tagline: "A crowned shadow. No pool is deployed here.",
    portrait: HIDDEN_BOSS_PORTRAIT,
    crop: HIDDEN_BOSS_CROP,
    status: "no-contract",
    locked: false,
    accent: entry.accent,
    source: "venue",
    rosterMeta: {
      rank: entry.rank,
      chain: "Base",
      category: entry.category,
      snapshot: `GeckoTerminal trending (base) · ${roster.snapshotDate}`,
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

export function bossHookForNetwork(boss: BossDefinition, chainId: number, defaultHook?: Address): Address | undefined {
  if (boss.source !== "chain") return undefined;
  if (!boss.deployment) return defaultHook;
  return boss.deployment.chainId === chainId ? boss.deployment.hookAddress : undefined;
}

export function isBossId(value: unknown): value is BossId {
  return typeof value === "string" && BOSS_IDS.has(value);
}
