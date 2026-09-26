import { describe, expect, test } from "bun:test";
import { BOSSES } from "../game/bosses";
import { transitionGuide, type GuideState } from "./hubGuide";

const welcome: GuideState = { step: "welcome", nearBoss: null };

describe("transitionGuide", () => {
  test("walks a player from welcome through an unlocked gate to done", () => {
    const started = transitionGuide(welcome, { type: "start" });
    const finding = transitionGuide(started, { type: "moved" });
    const inspecting = transitionGuide(finding, { type: "near", bossId: "cat" });
    const done = transitionGuide(inspecting, { type: "opened", bossId: "cat" });
    const hidden = transitionGuide(done, { type: "dismiss" });
    expect(started.step).toBe("move");
    expect(finding).toEqual({ step: "find", nearBoss: null });
    expect(inspecting).toEqual({ step: "inspect", nearBoss: "cat" });
    expect(done).toEqual({ step: "done", nearBoss: "cat" });
    expect(hidden.step).toBe("hidden");
  });

  test("keeps the guide in find when a contract-less gate is the discovery target", () => {
    let state = transitionGuide(welcome, { type: "start" });
    state = transitionGuide(state, { type: "moved" });
    state = transitionGuide(state, { type: "near", bossId: "aero" });
    // The AERO roster gate remains a Hidden Boss without a contract.
    expect(state).toEqual({ step: "find", nearBoss: "aero" });
    state = transitionGuide(state, { type: "opened", bossId: "aero" });
    expect(state).toEqual({ step: "find", nearBoss: "aero" });
  });

  // "locked" stays a dormant data state (no gate carries it); "active" is the
  // availability signal that unlocks inspect, so contract-less gates keep the
  // guide in `find`. If a locked gate ever returns, add a dedicated case for it.
  test("ships no locked gate in phase one", () => {
    expect(BOSSES.filter((boss) => boss.status === "locked")).toEqual([]);
  });

  test("only active gates advance find to inspect while contract-less gates stay in find", () => {
    for (const boss of BOSSES) {
      const state = transitionGuide({ step: "find", nearBoss: null }, { type: "near", bossId: boss.id });
      if (boss.status === "active") {
        expect(state).toEqual({ step: "inspect", nearBoss: boss.id });
        const opened = transitionGuide(state, { type: "opened", bossId: boss.id });
        expect(opened).toEqual({ step: "done", nearBoss: boss.id });
      } else {
        expect(state).toEqual({ step: "find", nearBoss: boss.id });
      }
    }
  });

  test("pins active as the only status that unlocks inspect", () => {
    // Mutation guard: exactly the active gates flip find -> inspect. If a gate's
    // status drifts (e.g. cat -> no-contract) this breaks immediately.
    const advancing = BOSSES.filter(
      (boss) =>
        transitionGuide({ step: "find", nearBoss: null }, { type: "near", bossId: boss.id }).step === "inspect",
    );
    expect(advancing.map((boss) => boss.id)).toEqual(
      BOSSES.filter((boss) => boss.status === "active").map((boss) => boss.id),
    );
    expect(advancing.length).toBeGreaterThan(0);
  });

  test("returns to find when the player leaves an unlocked gate", () => {
    const state = transitionGuide({ step: "inspect", nearBoss: "cat" }, { type: "near", bossId: null });
    expect(state).toEqual({ step: "find", nearBoss: null });
  });

  test("remembers a gate approached during the move step", () => {
    let state = transitionGuide(welcome, { type: "start" });
    state = transitionGuide(state, { type: "near", bossId: "cat" });
    expect(state).toEqual({ step: "move", nearBoss: "cat" });
    state = transitionGuide(state, { type: "moved" });
    expect(state).toEqual({ step: "inspect", nearBoss: "cat" });
  });

  test("does not complete when a different gate is opened", () => {
    const state = transitionGuide({ step: "inspect", nearBoss: "cat" }, { type: "opened", bossId: "macro-whale" });
    expect(state).toEqual({ step: "inspect", nearBoss: "cat" });
  });

  test("skip hides and replay restarts at welcome", () => {
    const skipped = transitionGuide({ step: "find", nearBoss: "cat" }, { type: "skip" });
    expect(skipped.step).toBe("hidden");
    const replayed = transitionGuide(skipped, { type: "replay" });
    expect(replayed).toEqual({ step: "welcome", nearBoss: null });
  });
});
