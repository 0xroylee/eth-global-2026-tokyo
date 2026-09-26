"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect, useRef } from "react";
import Link from "next/link";
import type { BossDefinition } from "@/game/bosses";
import { displayAmount, roundStatusLabel } from "@/lib/format";
import { type useBossPool } from "@/lib/useBossPool";

type Arena = ReturnType<typeof useBossPool>;
const CAT_FORMS = ["/images/boss-cat-form-a.png", "/images/boss-cat-form-b.png", "/images/boss-cat-form-c.png"] as const;

export function BossEntryPanel({
  boss,
  arena,
  onClose,
  suspendInput = false,
  onConnect,
  onSwitch,
}: {
  boss: BossDefinition;
  arena: Arena;
  onClose: () => void;
  suspendInput?: boolean;
  onConnect?: () => void;
  onSwitch?: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const live = arena.deployment.kind === "live" ? arena.deployment : null;
  const stage = live?.round.currentStage ?? 0;
  const portrait = boss.id === "cat" ? CAT_FORMS[Math.min(stage, 2)] : boss.portrait;
  const supported = boss.id === "cat";
  const needsWallet = supported && !arena.wallet.account;
  const needsSwitch = supported && Boolean(arena.wallet.account) && arena.networkMismatch;

  useEffect(() => {
    if (suspendInput) return;
    (needsWallet || needsSwitch ? actionRef : closeRef).current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [needsSwitch, needsWallet, onClose, suspendInput]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="boss-entry-title"
      inert={suspendInput}
      className="absolute inset-0 z-20 grid place-items-center bg-ink/70 p-4 backdrop-blur-[2px]"
    >
      <div className="panel-enter max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-[560px] overflow-y-auto rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-ink">
              {portrait ? (
                <img src={portrait} alt="" className="size-full object-cover object-top [image-rendering:pixelated]" />
              ) : (
                <span className="font-mono text-2xl text-dim">?</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="eyebrow mb-1">{boss.locked ? "GATE LOCKED" : supported ? "BOSS GATE" : "FIXTURE ONLY"}</p>
              <h2 id="boss-entry-title" className="text-2xl font-semibold tracking-[-0.03em]">
                {boss.name}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{boss.tagline}</p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close boss actions"
            className="shrink-0 rounded-lg border border-white/12 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-fog focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            CLOSE
          </button>
        </div>

        <div className="hairline mt-5 border-t pt-4">
          <BossHealth boss={boss} deployment={arena.deployment} />
        </div>

        {needsWallet && (
          <button
            ref={actionRef}
            type="button"
            onClick={onConnect}
            className="mt-5 w-full rounded-lg bg-accent/20 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-accent-soft transition-transform duration-150 ease-[var(--ease-out-strong)] hover:bg-accent/25 active:scale-[0.98]"
          >
            CONNECT WALLET TO CHALLENGE
          </button>
        )}
        {needsSwitch && (
          <button
            ref={actionRef}
            type="button"
            onClick={onSwitch}
            className="mt-5 w-full rounded-lg border border-[#f5b04a]/40 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-[#f5b04a] transition-transform duration-150 ease-[var(--ease-out-strong)] hover:bg-[#f5b04a]/10 active:scale-[0.98]"
          >
            SWITCH WALLET TO {arena.selectedChainId}
          </button>
        )}
        {supported && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/8 bg-ink/30 px-3 py-3">
            <div>
              <p className="font-mono text-[9px] tracking-[0.12em] text-dim">LIVE BATTLE</p>
              <p className="mt-1 text-xs text-muted">Enter the arena. Each attack spends up to 1 MockUSD.</p>
            </div>
            <Link
              href={`/battle?network=${arena.network}`}
              className="shrink-0 rounded-lg border border-white/12 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-fog transition-colors hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              ENTER BATTLE
            </Link>
          </div>
        )}
        {!supported && (
          <p className="mt-4 rounded-lg border border-white/8 px-3 py-3 text-xs leading-relaxed text-muted">
            This gate is a visual fixture. No contract or attack route is deployed for it.
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg border border-white/12 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-fog transition-transform duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.97]"
          >
            CLOSE · ESC
          </button>
        </div>
      </div>
    </div>
  );
}

function BossHealth({ boss, deployment }: { boss: BossDefinition; deployment: Arena["deployment"] }) {
  if (boss.id !== "cat") {
    return (
      <Row label="BOSS HP" badge="NO CONTRACT YET">
        <Bar fraction={null} />
      </Row>
    );
  }
  if (deployment.kind !== "live") {
    return (
      <Row label="BOSS HP" badge={deployment.kind === "loading" ? "CHECKING CHAIN" : "LIVE DATA UNAVAILABLE"}>
        <Bar fraction={null} />
      </Row>
    );
  }
  const { round } = deployment;
  const stage = round.currentStage;
  const cap = round.stageCapacity[stage] ?? 0n;
  const remaining = round.remainingSellableHP;
  const fraction = cap > 0n ? Number((remaining * 1000n) / cap) / 1000 : 0;
  return (
    <Row label={`STAGE ${stage + 1} / 3 · ${roundStatusLabel(round.status).toUpperCase()}`} badge="LIVE">
      <Bar fraction={fraction} />
      <p className="mt-1.5 font-mono text-[10px] text-dim">
        {displayAmount(remaining, 18)} / {displayAmount(cap, 18)} HP remaining
      </p>
    </Row>
  );
}

function Row({ label, badge, children }: { label: string; badge: string; children: React.ReactNode }) {
  const live = badge === "LIVE";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-mono text-[9px] tracking-[0.12em] text-dim">{label}</span>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[8px] tracking-[0.12em] ${
            live ? "border-live/30 text-live-soft" : "border-white/12 text-dim"
          }`}
        >
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function Bar({ fraction }: { fraction: number | null }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuenow={fraction ?? undefined}>
      {fraction === null ? (
        <div className="h-full w-full bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.08)_0_6px,transparent_6px_12px)]" />
      ) : (
        <div
          className="h-full origin-left rounded-full bg-gradient-to-r from-danger to-[#ff6b6b] transition-transform duration-300 ease-[var(--ease-out-strong)]"
          style={{ transform: `scaleX(${fraction})` }}
        />
      )}
    </div>
  );
}
