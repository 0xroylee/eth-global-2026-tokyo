"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BossDefinition } from "@/game/bosses";
import { BattleView } from "@/components/battle/BattleView";
import { displayAmount, roundStatusLabel } from "@/lib/format";
import { useMockBattle } from "@/lib/useMockBattle";
import type { DeploymentState } from "@/lib/useLocalRound";

export function BossEntryPanel({
  boss,
  deployment,
  onClose,
}: {
  boss: BossDefinition;
  deployment: DeploymentState;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const enterRef = useRef<HTMLButtonElement>(null);
  const [battleOpen, setBattleOpen] = useState(false);
  const battle = useMockBattle();

  const closeBattle = useCallback(() => {
    setBattleOpen(false);
    enterRef.current?.focus();
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // ESC dispatch: while the battle is open the panel ignores Escape, so the
  // BattleView handler alone closes exactly one layer per press.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (battleOpen) {
        closeBattle();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [battleOpen, closeBattle, onClose]);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="boss-entry-title"
        className="absolute inset-0 z-20 grid place-items-center bg-ink/70 p-4 backdrop-blur-[2px]"
      >
        <div className="panel-enter w-full max-w-[420px] rounded-2xl border border-white/12 bg-panel/95 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
          <div className="flex items-start gap-4">
            <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-ink">
              {boss.portrait ? (
                <img src={boss.portrait} alt="" className="size-full object-cover object-top" />
              ) : (
                <span className="font-mono text-2xl text-dim">?</span>
              )}
            </div>
            <div className="min-w-0">
              <p className="eyebrow mb-1">{boss.locked ? "GATE LOCKED" : "BOSS GATE"}</p>
              <h2 id="boss-entry-title" className="text-2xl font-semibold tracking-[-0.03em]">
                {boss.name}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{boss.tagline}</p>
            </div>
          </div>

          <div className="hairline mt-5 border-t pt-4">
            <BossHealth boss={boss} deployment={deployment} />
          </div>

          <div className="mt-5 flex gap-2">
            <button
              ref={enterRef}
              type="button"
              disabled={boss.id !== "cat"}
              onClick={() => setBattleOpen(true)}
              title={boss.id !== "cat" ? "Battle arena is the next build step" : undefined}
              className={`flex-1 rounded-lg px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] transition-transform duration-150 ease-[var(--ease-out-strong)] focus-visible:outline-2 focus-visible:outline-[#8ab4ff] active:scale-[0.98] ${
                boss.id === "cat"
                  ? "bg-accent/20 text-accent-soft hover:bg-accent/25"
                  : "bg-accent/20 text-accent-soft opacity-60"
              }`}
            >
              {boss.locked ? "LOCKED" : boss.id === "cat" ? "ENTER BATTLE" : "ENTER BATTLE · NEXT STEP"}
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/12 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-fog transition-transform duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.97]"
            >
              BACK · ESC
            </button>
          </div>
        </div>
      </div>

      {battleOpen && (
        <BattleView
          state={battle.state}
          phase={battle.phase}
          deadlineAt={battle.deadlineAt}
          onAttack={battle.attack}
          onClose={closeBattle}
        />
      )}
    </>
  );
}

function BossHealth({ boss, deployment }: { boss: BossDefinition; deployment: DeploymentState }) {
  // Only the cat is backed by the deployed round today.
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
  const sold = round.stageSold[stage] ?? 0n;
  const cap = round.stageCapacity[stage] ?? 0n;
  const remaining = cap > sold ? cap - sold : 0n;
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
