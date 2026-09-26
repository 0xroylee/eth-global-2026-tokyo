import { describe, expect, test } from "bun:test";
import { BOSSES } from "@/game/bosses";
import { roundStatusLabel } from "./format";
import { SAGE_DEFEATED_STORAGE_KEY, SAGE_TALKED_STORAGE_KEY, sageLines } from "./sageLines";

/** The Launch Boost roster the sage counts, and the hub's total gate count. */
const CHALLENGERS = 10;
const GATES = 12;

describe("sageLines", () => {
  test("counts the roster from the boss table, not from the prose", () => {
    expect(BOSSES.filter((boss) => boss.rosterMeta !== undefined)).toHaveLength(CHALLENGERS);
    expect(BOSSES).toHaveLength(GATES);
  });

  test("a first visit introduces the challengers and the one awake gate", () => {
    const lines = sageLines({ firstVisit: true, defeated: false });
    expect(lines).toHaveLength(2);
    expect(lines.join("")).toContain(`${CHALLENGERS}`);
    expect(lines.join("")).toContain("Roy");
  });

  test("a repeat visit sends the player after ROO", () => {
    const lines = sageLines({ firstVisit: false, defeated: false });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`${CHALLENGERS}`);
    expect(lines[0]).toContain("ROO");
  });

  test("a defeated cat leaves eleven gates waiting", () => {
    const lines = sageLines({ firstVisit: false, defeated: true });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`${GATES - 1}`);
    expect(lines[0]).toContain("Roy");
  });

  test("the introduction outranks a defeat so a new player still hears it", () => {
    expect(sageLines({ firstVisit: true, defeated: true })).toEqual(sageLines({ firstVisit: true, defeated: false }));
  });

  test("the storage keys stay the ones the shell reads and writes", () => {
    expect(SAGE_TALKED_STORAGE_KEY).toBe("boss-pool:sage-talked:v1");
    expect(SAGE_DEFEATED_STORAGE_KEY).toBe("boss-pool:defeated:v1");
  });

  // The shell writes the defeated marker on `round.status === 3`. That literal is
  // only correct while this label holds, and a live round is the only thing that
  // can produce it — so pin the mapping here instead of trusting the comment.
  test("the defeat the marker is written on is still status 3", () => {
    expect(roundStatusLabel(3)).toBe("Defeated");
  });
});
