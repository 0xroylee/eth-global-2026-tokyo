import { describe, expect, test } from "bun:test";
import { routeAttackCommand } from "./attackCommand";

describe("SWAP ATTACK command routing", () => {
  test("sends a fresh ready attack directly to the wallet", () => {
    expect(routeAttackCommand({ quoteFresh: true, attackReady: true, allowanceMissing: false, approvalReady: false })).toBe("attack");
  });

  test("opens approval only for a fresh quote and a confirmed missing allowance", () => {
    expect(routeAttackCommand({ quoteFresh: true, attackReady: false, allowanceMissing: true, approvalReady: true })).toBe("approval");
  });

  test("does not route a stale quote into attack or approval", () => {
    expect(routeAttackCommand({ quoteFresh: false, attackReady: false, allowanceMissing: true, approvalReady: true })).toBe("wait");
  });

  test("waits while wallet readiness is still loading", () => {
    expect(routeAttackCommand({ quoteFresh: true, attackReady: false, allowanceMissing: false, approvalReady: false })).toBe("wait");
  });
});
