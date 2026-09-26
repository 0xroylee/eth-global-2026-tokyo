"use client";

import { useEffect, useState } from "react";
import type { ApprovalStatus, BossPoolSdk } from "@boss-pool/chain";
import type { useBossPool } from "@/lib/useBossPool";
import { displayEstimate } from "@/lib/format";

type Quote = Awaited<ReturnType<BossPoolSdk["quoteOwnerLiquidity"]>>;

export function OwnerLiquidity({ arena }: { arena: ReturnType<typeof useBossPool> }) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [percent, setPercent] = useState("10");
  const [quote, setQuote] = useState<Quote>();
  const [approvals, setApprovals] = useState<ApprovalStatus[]>([]);
  const [error, setError] = useState<string>();
  const live = arena.deployment.kind === "live" ? arena.deployment : undefined;
  const position = live?.round.continuousLiquidity;
  const owner = position?.owner.toLowerCase() === arena.wallet.account?.toLowerCase();
  const sdk = arena.sdk;
  const busy = arena.writeState.status === "prompting" || arena.writeState.status === "pending" || arena.writeState.status === "unresolved" || Boolean(arena.pendingRecord);
  const validPercent = /^\d+$/.test(percent) && Number(percent) > 0 && Number(percent) <= 100;
  const size = position && validPercent ? (direction === "add" ? position.minimumLiquidity : position.ownerLiquidity) * BigInt(percent) / 100n : 0n;
  const delta = direction === "add" ? size : -size;

  useEffect(() => {
    let active = true;
    setQuote(undefined);
    setApprovals([]);
    setError(undefined);
    if (!owner || !sdk || !arena.wallet.account || delta === 0n || busy) return;
    const account = arena.wallet.account;
    void (async () => {
      try {
        const next = await sdk.quoteOwnerLiquidity(delta);
        const permissions = delta > 0n ? await Promise.all([
          sdk.getApproval({ kind: "ownerLiquidity", token: "BossHP", amount: next.maxBossHPIn }, account),
          sdk.getApproval({ kind: "ownerLiquidity", token: "ROY", amount: next.maxRoyIn }, account),
        ]) : [];
        if (active) { setQuote(next); setApprovals(permissions); }
      } catch (failure) { if (active) setError(failure instanceof Error ? failure.message : "Liquidity quote unavailable."); }
    })();
    return () => { active = false; };
  }, [sdk, arena.wallet.account, live?.hookAddress, live?.round.blockNumber, owner, delta, busy]);

  if (!live || !position || !owner) return null;
  const approval = approvals.find((permission) => permission.approvalNeeded);
  const ready = Boolean(quote && quote.delta === delta && quote.chainId === live.manifest.chainId && quote.hook.toLowerCase() === live.hookAddress.toLowerCase() && quote.router.toLowerCase() === live.manifest.addresses.router.toLowerCase() && quote.owner.toLowerCase() === arena.wallet.account?.toLowerCase() && owner && arena.canWrite && !arena.networkMismatch && !busy);
  const submit = async () => {
    if (!ready || !sdk || !quote) return;
    try {
      if (approval) await arena.runPending(approval.approvalAmount === 0n ? "Reset liquidity token allowance" : "Approve liquidity token", () => sdk.approve({ kind: "ownerLiquidity", token: approval.token === "BossHP" ? "BossHP" : "ROY", amount: approval.requiredAllowance }), "approval");
      else await arena.runPending(direction === "add" ? "Add owner liquidity" : "Remove owner liquidity", () => sdk.modifyOwnerLiquidity(quote), "ownerLiquidity");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Liquidity transaction failed."); }
  };
  return <details className="mt-4 border-y border-[#2b4a8b]/25 py-2">
    <summary className="min-h-11 cursor-pointer py-3 font-pixel text-[11px]">Owner liquidity</summary>
    <p className="text-xs leading-relaxed">Add tokens at the current pool ratio. Remove only your added liquidity. The initial pool liquidity remains locked.</p>
    <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs">Action<select value={direction} onChange={(event) => setDirection(event.target.value as "add" | "remove")} disabled={busy} className="min-h-11 border border-[#2b4a8b]/40 bg-white px-3"><option value="add">Add liquidity</option><option value="remove">Remove added liquidity</option></select></label>
      <label className="grid gap-1 text-xs">{direction === "add" ? "% of initial pool size" : "% of your added position"}<input type="number" min="1" max="100" step="1" value={percent} onChange={(event) => setPercent(event.target.value)} disabled={busy} className="min-h-11 w-28 border border-[#2b4a8b]/40 bg-white px-3" /></label>
    </div>
    {direction === "remove" && position.ownerLiquidity === 0n && <p role="status" className="mt-3 text-xs">You have no added liquidity to remove.</p>}
    {quote && <p className="mt-3 text-xs leading-relaxed">{direction === "add" ? "Estimated deposit" : "Estimated principal return"}: {displayEstimate(quote.bossHP, live.round.hpToken.decimals)} {live.round.hpToken.symbol} + {displayEstimate(quote.roy, 18)} Attack Token. 1% slippage tolerance. {direction === "remove" && "Accrued fees are paid separately."}</p>}
    {approval && <p className="mt-2 text-xs">{approval.approvalAmount === 0n ? "Reset the current allowance before approving the new amount." : `Approve up to ${displayEstimate(approval.approvalAmount, approval.token === "BossHP" ? live.round.hpToken.decimals : 18)} ${approval.token === "BossHP" ? live.round.hpToken.symbol : "Attack Token"} for this deposit.`} Approval is a separate transaction.</p>}
    <button type="button" disabled={!ready} onClick={() => void submit()} className="mt-3 min-h-11 border-2 border-[#2b4a8b] bg-[#a9d6ff] px-4 py-2 text-xs font-semibold disabled:opacity-40">{busy ? "Waiting for transaction receipt…" : approval ? approval.approvalAmount === 0n ? "Reset allowance" : "Approve token" : direction === "add" ? "Add liquidity" : "Remove liquidity"}</button>
    {error && <p role="alert" className="mt-2 text-xs text-[#a14845]">{error}</p>}
  </details>;
}
