"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect } from "react";
import { MOCK_STAGE_DAMAGE, type AttackPhase, type MockBattleState } from "@/lib/mockBattle";
import { AttackPanel } from "./AttackPanel";
import { BossStage } from "./BossStage";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { HPBar } from "./HPBar";
import { MockBadge } from "./MockBadge";
import { StageIndicator } from "./StageIndicator";
import { VictoryCard } from "./VictoryCard";

const STAGE = [1, 2, 3] as const;

/**
 * Full-screen battle overlay (`z-30`, above the entry panel's `z-20`).
 * Presentation only: data arrives via props, never from the chain.
 */
export function BattleView({
  state,
  phase,
  deadlineAt,
  onAttack,
  onClose,
}: {
  state: MockBattleState;
  phase: AttackPhase;
  deadlineAt: number;
  onAttack: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stage = STAGE[state.currentStage] ?? 1;
  const cap = state.stageCapacity[state.currentStage];
  const sold = state.stageSold[state.currentStage];
  const remaining = cap > sold ? cap - sold : 0n;
  const canAttack = phase === "idle" && state.status === 1 && !state.victory;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-title"
      className="fixed inset-0 z-30 overflow-y-auto"
    >
      <div aria-hidden className="absolute inset-0">
        <img src="/images/arena-lake-background.png" alt="" className="size-full object-cover" />
        <div className="absolute inset-0 bg-ink/80" />
      </div>

      <img
        src="/images/player-you-master.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-5 left-5 hidden w-20 md:block"
      />

      <div className="relative flex min-h-full flex-col">
        <header className="hairline flex h-14 items-center justify-between gap-3 border-b bg-panel/60 px-4 backdrop-blur-[2px]">
          <MockBadge />
          <h1 id="battle-title" className="font-mono text-[11px] tracking-[0.18em] text-fog">
            ROY · BOSS BATTLE
          </h1>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-lg border border-white/12 px-4 py-2 font-mono text-[10px] tracking-[0.14em] text-fog transition-transform duration-150 ease-[var(--ease-out-strong)] focus-visible:outline-2 focus-visible:outline-[#8ab4ff] hover:bg-white/5 active:scale-[0.97]"
          >
            EXIT BATTLE · ESC
          </button>
        </header>

        <main className="mx-auto grid w-full max-w-[960px] flex-1 grid-cols-1 content-center items-center gap-6 p-5 md:grid-cols-[1fr_340px] md:gap-10 md:p-8">
          <section className="w-full space-y-4">
            <BossStage stage={stage} state={state.bossState} />
            <div className="mx-auto max-w-[420px] space-y-3 rounded-2xl border border-white/12 bg-panel/70 p-4 backdrop-blur-[2px]">
              <StageIndicator stage={stage} />
              <HPBar remaining={remaining} capacity={cap} stage={stage} state={state.bossState} />
              <DeadlineCountdown deadlineAt={deadlineAt} />
            </div>
          </section>

          <section className="w-full">
            {state.victory ? (
              <VictoryCard
                eligibleHP={state.finalEligibleHP}
                finalEligibleHP={state.finalEligibleHP}
                prize={state.originalPrize}
                historicalDamage={state.finalEligibleHP}
              />
            ) : (
              <AttackPanel
                phase={phase}
                damage={MOCK_STAGE_DAMAGE[state.currentStage]}
                canAttack={canAttack}
                onAttack={onAttack}
              />
            )}
          </section>
        </main>
      </div>

      {state.status === 2 && (
        <div role="status" className="absolute inset-0 z-40 grid place-items-center bg-ink/85">
          <p className="font-mono text-2xl tracking-[0.3em] text-fog">STAGE CLEARED</p>
        </div>
      )}
    </div>
  );
}
