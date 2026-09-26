"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import type { useBossPool } from "@/lib/useBossPool";
import { displayAmount, displayEstimate } from "@/lib/format";

export function MockOracle({ arena }: { arena: ReturnType<typeof useBossPool> }) {
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string>();
  const live = arena.deployment.kind === "live" ? arena.deployment : undefined;
  const oracle = live?.round.mockOracle;
  const owner = oracle?.owner?.toLowerCase() === arena.wallet.account?.toLowerCase();
  const busy = ["prompting", "pending", "unresolved"].includes(arena.writeState.status) || Boolean(arena.pendingRecord);
  if (!live || !oracle) return null;
  const decimals = live.round.hpToken.decimals;
  const humanPrice = (value: bigint) => value * 10n ** BigInt(decimals) * 1_000_000_000_000n / (1n << 128n) / 1_000_000n;
  const ready = owner && arena.canWrite && !arena.networkMismatch && !busy;
  const submit = async (value: bigint) => {
    if (!ready || !arena.sdk || value <= 0n) return;
    setError(undefined);
    try { await arena.runPending("Update testnet mock price", () => arena.sdk!.setMockPrice(value), "mockPrice"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Mock price update failed."); }
  };
  const customPrice = () => {
    try {
      const value = parseUnits(price, 12) * 1_000_000n * (1n << 128n) / 10n ** BigInt(decimals) / 1_000_000_000_000n;
      if (value <= 0n) throw new Error("Enter a positive MockUSD price.");
      void submit(value);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Enter a valid price."); }
  };
  const initialize = async () => {
    if (!ready || !arena.sdk) return;
    setError(undefined);
    try { await arena.runPending("Initialize testnet mock reference", async () => {
      const reference = await arena.sdk!.quoteMockInitialPrice();
      return arena.sdk!.setMockPrice(reference.priceX128, true);
    }, "mockPrice"); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Initial reference unavailable."); }
  };
  const initial = oracle.initialPriceX128 ?? 0n;
  return <section aria-label="Testnet mock price" className="mt-4 border-y border-[#2b4a8b]/25 py-3 text-xs">
    <h3 className="font-pixel text-[11px]">TESTNET MOCK PRICE</h3>
    <p className="mt-2 leading-relaxed">An owner-controlled demo reference for {live.round.hpToken.symbol}. The boss pool fee can become cheaper, including 0%, or more expensive relative to this reference. The supply pool fee remains 0.3%.</p>
    <dl className="mt-3 grid grid-cols-2 gap-2 tabular-nums"><dt>Demo reference</dt><dd className="text-right" title={oracle.priceX128 ? `${displayAmount(humanPrice(oracle.priceX128), 12)} MockUSD per token` : undefined}>{oracle.priceX128 ? `${displayEstimate(humanPrice(oracle.priceX128), 12)} MockUSD / ${live.round.hpToken.symbol}` : "Unavailable"}</dd><dt>Source status</dt><dd className="text-right">{oracle.status}</dd><dt>Updated</dt><dd className="text-right">{oracle.updatedAt ? new Date(Number(oracle.updatedAt) * 1_000).toISOString() : "Unavailable"}</dd><dt>Freshness limit</dt><dd className="text-right">{oracle.maxAge.toString()} seconds</dd><dt>Maximum fee</dt><dd className="text-right">{oracle.maxFee / 10_000}%</dd></dl>
    <p className="mt-2 break-all">Source: {oracle.source}</p>
    <p className="mt-2 leading-relaxed">This price is simulated. It does not report a market USD price. Stale or invalid prices and fees above the maximum stop attacks. Claims and owner liquidity remain available.</p>
    {owner && <div className="mt-3">
      {initial === 0n && <button type="button" disabled={!ready || live.round.totalVolume !== 0n} onClick={() => void initialize()} className="mb-3 min-h-11 border border-[#2b4a8b] bg-[#a9d6ff] px-3 disabled:opacity-40">Initialize reference from pool spots</button>}
      <p>Presets use the initial pool quote. Each update refreshes the on-chain timestamp.</p>
      <div className="mt-2 flex flex-wrap gap-2">{[["Reset · 1×", initial], ["4×", initial * 4n], ["0.25×", initial / 4n], ["Refresh same price", oracle.priceX128 ?? 0n]].map(([label, value]) => <button key={String(label)} type="button" disabled={!ready || typeof value !== "bigint" || value <= 0n} onClick={() => typeof value === "bigint" && void submit(value)} className="min-h-11 border border-[#2b4a8b] px-3 disabled:opacity-40">{String(label)}</button>)}</div>
      <label className="mt-3 grid gap-1">Custom MockUSD per {live.round.hpToken.symbol}<input type="text" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} disabled={!ready} className="min-h-11 border border-[#2b4a8b]/40 bg-white px-3" /></label>
      <button type="button" disabled={!ready || !price} onClick={customPrice} className="mt-2 min-h-11 border border-[#2b4a8b] bg-[#a9d6ff] px-3 disabled:opacity-40">Set demo price</button>
    </div>}
    {error && <p role="alert" className="mt-2 text-[#a14845]">{error}</p>}
  </section>;
}
