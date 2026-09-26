import { describe, expect, test } from "bun:test";
import roster from "./boss-roster.json";
import { BOSSES, findBoss, HIDDEN_BOSS_PORTRAIT } from "./bosses";

/** The curated Launch Boost snapshot and the hub's total gate count. */
const ROSTER_SIZE = 10;
const GATES = 12;

describe("boss table", () => {
  // The shell routes a gate to the battle panel or to the roster card on `source`.
  // Exactly one gate owns contract semantics, and it is the playable cat.
  test("carries contract semantics on the cat gate alone", () => {
    expect(BOSSES.filter((boss) => boss.source === "chain").map((boss) => boss.id)).toEqual(["cat"]);
  });

  test("gives every gate without a contract the hidden boss face", () => {
    const hidden = BOSSES.filter((boss) => boss.source !== "chain");
    expect(hidden.length).toBeGreaterThan(0);
    for (const boss of hidden) {
      expect(boss.name).toBe("Hidden Boss");
      expect(boss.ticker).toBe("HIDDEN");
      expect(boss.portrait).toBe(HIDDEN_BOSS_PORTRAIT);
      expect(boss.crop).not.toBeNull();
    }
    expect(findBoss("cat").portrait).not.toBe(HIDDEN_BOSS_PORTRAIT);
  });

  test("derives every curated roster entry as a venue showcase", () => {
    expect(roster.bosses).toHaveLength(ROSTER_SIZE);
    for (const entry of roster.bosses) {
      expect(findBoss(entry.id).source).toBe("venue");
    }
  });

  // `locked` is hand-written per entry while `status` drives the chip and the panel.
  // Phase 1 ships every gate unlocked, so only the mirror rule can catch drift.
  test("keeps locked in step with status for every gate", () => {
    for (const boss of BOSSES) expect(boss.locked).toBe(boss.status === "locked");
  });

  test("ships one gate per boss with a distinct id and accent", () => {
    expect(BOSSES).toHaveLength(GATES);
    expect(new Set(BOSSES.map((boss) => boss.id)).size).toBe(GATES);
    expect(new Set(BOSSES.map((boss) => boss.accent)).size).toBe(GATES);
  });
});
