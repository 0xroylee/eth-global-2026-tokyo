/** Bosses the hub can open. Positions live on the Tiled marker layer. */
export type BossId = "cat" | "macro-whale" | "locked";

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
    name: "Roy",
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
