/** Boss gate definitions for the hub. Positions are world coordinates. */
export type BossId = "cat" | "macro-whale" | "locked";

export type BossDefinition = {
  id: BossId;
  name: string;
  tagline: string;
  /** Portrait image under /public/images. */
  portrait: string;
  /** Gate location in the hub world. */
  gate: { x: number; y: number };
  locked: boolean;
};

export const BOSSES: readonly BossDefinition[] = [
  {
    id: "cat",
    name: "Roy",
    tagline: "The evolving cat. Three forms, one pool.",
    portrait: "/images/boss-cat-form-a.png",
    gate: { x: 300, y: 250 },
    locked: false,
  },
  {
    id: "macro-whale",
    name: "Macro Whale",
    tagline: "Moves markets with a single splash.",
    portrait: "/images/boss-macro-whale-portrait.png",
    gate: { x: 1140, y: 250 },
    locked: true,
  },
  {
    id: "locked",
    name: "???",
    tagline: "This gate has not opened yet.",
    portrait: "",
    gate: { x: 720, y: 150 },
    locked: true,
  },
];

export function findBoss(id: BossId): BossDefinition {
  const boss = BOSSES.find((b) => b.id === id);
  if (!boss) throw new Error(`Unknown boss ${id}`);
  return boss;
}
