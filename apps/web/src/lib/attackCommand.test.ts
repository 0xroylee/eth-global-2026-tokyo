import { describe, expect, test } from "bun:test";
import { routeAttackCommand } from "./attackCommand";

const ONE_MOCK_USD = 1_000_000n;

describe("SWAP ATTACK command routing", () => {
  test("sends a fresh ready attack directly to the wallet", () => {
    expect(routeAttackCommand({ quoteFresh: true, quoteMaxMockUSD: ONE_MOCK_USD, selectedMaxMockUSD: ONE_MOCK_USD, attackReady: true, allowanceMissing: false, approvalReady: false })).toBe("attack");
  });

  test("opens approval only for a fresh quote and a confirmed missing allowance", () => {
    expect(routeAttackCommand({ quoteFresh: true, quoteMaxMockUSD: ONE_MOCK_USD, selectedMaxMockUSD: ONE_MOCK_USD, attackReady: false, allowanceMissing: true, approvalReady: true })).toBe("approval");
  });

  test("does not route a stale quote into attack or approval", () => {
    expect(routeAttackCommand({ quoteFresh: false, quoteMaxMockUSD: ONE_MOCK_USD, selectedMaxMockUSD: ONE_MOCK_USD, attackReady: false, allowanceMissing: true, approvalReady: true })).toBe("wait");
  });

  test("does not submit a fresh quote for a previously selected cap", () => {
    expect(routeAttackCommand({ quoteFresh: true, quoteMaxMockUSD: ONE_MOCK_USD, selectedMaxMockUSD: 5n * ONE_MOCK_USD, attackReady: true, allowanceMissing: false, approvalReady: false })).toBe("wait");
  });

  test("waits while wallet readiness is still loading", () => {
    expect(routeAttackCommand({ quoteFresh: true, quoteMaxMockUSD: ONE_MOCK_USD, selectedMaxMockUSD: ONE_MOCK_USD, attackReady: false, allowanceMissing: false, approvalReady: false })).toBe("wait");
  });
});
