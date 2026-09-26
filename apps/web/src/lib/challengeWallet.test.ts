import { describe, expect, test } from "bun:test";
import { bossToRestore, idleIntent, transitionChallengeIntent, type IntentState } from "./challengeWallet";

function apply(state: IntentState, ...actions: Parameters<typeof transitionChallengeIntent>[1][]) {
  return actions.reduce((current, action) => transitionChallengeIntent(current, action).state, state);
}

describe("transitionChallengeIntent", () => {
  test("a stale success after cancel cannot restore a boss", () => {
    const requested = transitionChallengeIntent(idleIntent, { type: "request", bossId: "cat" });
    const cancelled = transitionChallengeIntent(requested.state, { type: "cancel" });
    const stale = transitionChallengeIntent(cancelled.state, { type: "settle", generation: requested.state.generation });
    expect(stale.restoreBossId).toBeNull();
    expect(bossToRestore(stale, null)).toBeNull();
    expect(bossToRestore(stale, "cat")).toBeNull();
  });

  test("HUD connect cannot start a challenge", () => {
    const hud = transitionChallengeIntent(idleIntent, { type: "hud" });
    expect(hud.state.intent).toBeNull();
    expect(hud.restoreBossId).toBeNull();
    const settled = transitionChallengeIntent(hud.state, { type: "settle", generation: 1 });
    expect(settled.restoreBossId).toBeNull();
  });

  test("selecting a different pool invalidates the prior intent", () => {
    const requested = apply(idleIntent, { type: "request", bossId: "cat" });
    const switched = transitionChallengeIntent(requested, { type: "select", bossId: "macro-whale" });
    expect(switched.state.intent).toBeNull();
    const stale = transitionChallengeIntent(switched.state, { type: "settle", generation: requested.generation });
    expect(stale.restoreBossId).toBeNull();
  });

  test("a matching success restores only the boss that is still open", () => {
    const requested = transitionChallengeIntent(idleIntent, { type: "request", bossId: "cat" });
    const settled = transitionChallengeIntent(requested.state, { type: "settle", generation: requested.state.generation });
    expect(settled.state.intent).toBeNull();
    expect(bossToRestore(settled, "cat")).toBe("cat");
    expect(bossToRestore(settled, null)).toBeNull();
    expect(bossToRestore(settled, "macro-whale")).toBeNull();
  });
});
