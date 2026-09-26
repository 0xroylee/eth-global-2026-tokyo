import { describe, expect, test } from "bun:test";
import { attackQuoteFunding, quoteMatchesAttackCap, routeAttackCommand } from "./attackCommand";

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

  test("routes the signed stage cap while retaining the selected button cap", () => {
    expect(routeAttackCommand({ quoteFresh: true, quoteMaxMockUSD: 2n, quoteRequestedMaxMockUSD: ONE_MOCK_USD, selectedMaxMockUSD: ONE_MOCK_USD, attackReady: true, allowanceMissing: false, approvalReady: false })).toBe("attack");
    expect(routeAttackCommand({ quoteFresh: true, quoteMaxMockUSD: 2n * ONE_MOCK_USD, quoteRequestedMaxMockUSD: ONE_MOCK_USD, selectedMaxMockUSD: ONE_MOCK_USD, attackReady: true, allowanceMissing: false, approvalReady: false })).toBe("wait");
  });

  test("a clipped stage quote is funded by 0.3 MockUSD and only needs its signed allowance", () => {
    const quote = { requestedMaxMockUSD: ONE_MOCK_USD, maxMockUSD: 200_001n };
    expect(quoteMatchesAttackCap(quote, 1)).toBe(true);
    expect(quoteMatchesAttackCap(quote, 5)).toBe(false);
    const funding = attackQuoteFunding(quote, 300_000n, 200_001n)!;
    expect(funding).toEqual({ required: 200_001n, funded: true, needsApproval: false });
    expect(routeAttackCommand({ quoteFresh: true, quoteRequestedMaxMockUSD: quote.requestedMaxMockUSD, quoteMaxMockUSD: quote.maxMockUSD, selectedMaxMockUSD: ONE_MOCK_USD, attackReady: funding.funded && !funding.needsApproval, allowanceMissing: funding.needsApproval, approvalReady: funding.funded })).toBe("attack");
    expect(attackQuoteFunding(quote, 300_000n, 200_000n)?.needsApproval).toBe(true);
  });
});
