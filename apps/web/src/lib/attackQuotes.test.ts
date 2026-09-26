import { expect, spyOn, test } from "bun:test";
import type { AttackQuote } from "@boss-pool/chain";
import { attackCapAmount, type AttackCap } from "./attackCommand";
import { pollAttackQuotes } from "./attackQuotes";

function quoteFor(cap: AttackCap): AttackQuote {
  const address = "0x0000000000000000000000000000000000000001";
  return {
    chainId: 31337, deploymentTxHash: "0x01", hook: address, router: address,
    quotedBlock: 1n, quotedAt: 1_000n, expiresAt: 1_300n, stage: 0,
    maxMockUSD: attackCapAmount(cap), mockUSDSpent: attackCapAmount(cap), mockUSDRefunded: 0n,
    royBought: 100n, roySpent: 100n, royRefunded: 0n, bossHPOut: 100n,
    minRoyOut: 99n, minBossHPOut: 99n, slippageBps: 100,
    supplyPoolFee: 3000, bossPoolFee: 3000, stageCleared: false, bossDefeated: false, nextStage: 0,
  };
}

test("preloads every attack, refreshes at 30 seconds, isolates failures, and discards late results", async () => {
  const calls: AttackCap[] = [];
  const quotes = new Map<AttackCap, AttackQuote>();
  const errors: AttackCap[] = [];
  let resolveSlow = (_quote: AttackQuote) => {};
  let failRefresh = false;
  const interval = spyOn(globalThis, "setInterval");
  const stop = pollAttackQuotes(async (cap) => {
    calls.push(cap);
    if (cap === 10) return new Promise<AttackQuote>((resolve) => { resolveSlow = resolve; });
    if (failRefresh && cap === 5) throw new Error("RPC unavailable");
    return quoteFor(cap);
  }, (cap, quote) => quotes.set(cap, quote), (cap) => errors.push(cap));
  try {
    const tick = interval.mock.calls[0]![0];
    expect(interval.mock.calls[0]?.[1]).toBe(30_000);
    expect(calls).toEqual([1, 5, 10]);
    await Bun.sleep(0);
    expect([...quotes.keys()]).toEqual([1, 5]);
    const previous = quotes.get(5);
    failRefresh = true;
    tick();
    expect(calls).toEqual([1, 5, 10, 1, 5]); // The slow request never overlaps.
    expect(quotes.get(5)).toBe(previous); // Refresh keeps the existing quote visible.
    await Bun.sleep(0);
    expect(errors).toEqual([5]);
    expect(quotes.get(5)).toBe(previous);
    failRefresh = false;
    tick();
    await Bun.sleep(0);
    expect(quotes.get(5)).not.toBe(previous); // A later poll recovers independently.
    stop();
    resolveSlow(quoteFor(10));
    await Bun.sleep(0);
    expect(quotes.has(10)).toBe(false); // Unmount or context change cannot publish old data.
    const count = calls.length;
    tick();
    expect(calls).toHaveLength(count);
  } finally {
    stop();
    interval.mockRestore();
  }
});
