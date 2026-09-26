import { getAddress, isAddress } from "viem";

/** Bosses the hub can open. Positions live on the Tiled marker layer. */
export type BossId = "cat" | "macro-whale" | "locked";

export type BossPresentation = {
  name: string;
  japaneseName?: string;
  stageImages: readonly [string, string, string];
};

const POOL_UNIS_PRESENTATION: BossPresentation = {
  name: "Pool Unis",
  japaneseName: "プール・ユニス",
  stageImages: [
    "/images/boss-cat-form-a.png?v=6",
    "/images/boss-cat-form-b.png?v=6",
    "/images/boss-cat-form-c.png?v=8",
  ],
};

/** A presentation is a checked-in choice for one chain and Hook; it never verifies a contract. */
const BOSS_PRESENTATIONS: Readonly<Record<string, BossPresentation>> = {
  "84532:0xe217b4840049f928d4392030ac86ace6b3766ac0": POOL_UNIS_PRESENTATION,
  "84532:0xc11d07448948ac4757592e91d8f5155907ef6ac0": POOL_UNIS_PRESENTATION,
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
  tagline: string;
  /** Portrait image under /public/images. Empty when there is no portrait. */
  portrait: string;
  locked: boolean;
};

export const BOSSES: readonly BossDefinition[] = [
  {
    id: "cat",
    name: "Pool Unis",
    tagline: "The evolving cat. Three forms, one pool.",
    portrait: "/images/boss-cat-form-a.png",
    locked: false,
  },
  {
    id: "macro-whale",
    name: "Macro Whale",
    tagline: "Moves markets with a single splash.",
    portrait: "/images/boss-macro-whale-portrait.png",
    locked: false,
  },
  {
    id: "locked",
    name: "???",
    tagline: "This gate has not opened yet.",
    portrait: "",
    locked: true,
  },
];

export function findBoss(id: BossId): BossDefinition {
  const boss = BOSSES.find((b) => b.id === id);
  if (!boss) throw new Error(`Unknown boss ${id}`);
  return boss;
}

export function isBossId(value: unknown): value is BossId {
  return value === "cat" || value === "macro-whale" || value === "locked";
}
