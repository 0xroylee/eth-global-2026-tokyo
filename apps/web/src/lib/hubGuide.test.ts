import { describe, expect, test } from "bun:test";
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

  test("accepts the macro whale as a discovery target", () => {
    let state = transitionGuide(welcome, { type: "start" });
    state = transitionGuide(state, { type: "moved" });
    state = transitionGuide(state, { type: "near", bossId: "macro-whale" });
    state = transitionGuide(state, { type: "opened", bossId: "macro-whale" });
    expect(state.step).toBe("done");
    expect(state.nearBoss).toBe("macro-whale");
  });

  test("ignores the locked gate", () => {
    let state = transitionGuide({ step: "find", nearBoss: null }, { type: "near", bossId: "locked" });
    expect(state).toEqual({ step: "find", nearBoss: "locked" });
    state = transitionGuide({ step: "inspect", nearBoss: "cat" }, { type: "near", bossId: "locked" });
    expect(state.step).toBe("find");
    state = transitionGuide(state, { type: "opened", bossId: "locked" });
    expect(state.step).toBe("find");
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
