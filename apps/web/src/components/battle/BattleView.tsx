"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect } from "react";
import { MOCK_STAGE_DAMAGE, type AttackPhase, type MockBattleState } from "@/lib/mockBattle";
import { BossStage } from "./BossStage";
import { CommandWindow } from "./CommandWindow";
import { CroppedSprite } from "./CroppedSprite";
import { DialogWindow } from "./DialogWindow";
import { NamePlate } from "./NamePlate";
import { StatusPanel } from "./StatusPanel";
import { VictoryCard } from "./VictoryCard";

const STAGE = [1, 2, 3] as const;

/**
 * Full-screen battle overlay (`z-30`, above the entry panel's `z-20`).
 * JRPG pixel layout (uiux-battle v2 §4): STATUS top-left, NAME PLATE
 * top-right, BOSS right-middle, HERO+COMMAND bottom-left, DIALOG bottom-right,
 * VICTORY and STAGE CLEARED as centered overlays.
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
  const canAttack = phase === "idle" && state.status === 1 && !state.victory;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="battle-title"
      className="fixed inset-0 z-30 overflow-hidden"
    >
      <div aria-hidden className="absolute inset-0">
        <img
          src="/images/arena-lake-background.png"
          alt=""
          className="size-full object-cover [image-rendering:pixelated]"
        />
        <div className="absolute inset-0 bg-ink/45" />
      </div>

      <h1 id="battle-title" className="sr-only">
        Attack Token · BOSS BATTLE
      </h1>

      {/* STATUS zone — top-left */}
      <div className="absolute left-[2%] top-[2.5%] w-[min(320px,32vw)] max-md:w-[min(340px,44vw)]">
        <StatusPanel state={state} stage={stage} deadlineAt={deadlineAt} />
      </div>

      {/* NAME PLATE zone — top-right */}
      <div className="absolute right-[2%] top-[2.5%] flex flex-col items-end gap-2">
        <NamePlate stage={stage} />
        <button
          type="button"
          onClick={onClose}
          className="window-chrome min-h-[44px] px-4 py-2 font-mono text-[10px] tracking-[0.14em] transition-transform duration-150 ease-[var(--ease-out-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4ff] hover:opacity-80 active:scale-[0.97]"
        >
          EXIT BATTLE · ESC
        </button>
      </div>

      {/* BOSS zone — right-middle, lower; on narrow screens the bottom band is
          taller, so the zone rises to keep clear of the command window. */}
      <div className="absolute bottom-[26%] right-[26%] aspect-square h-[min(34vh,340px)] max-md:right-[10%] max-md:bottom-[36%] max-md:h-[24vh]">
        <BossStage stage={stage} state={state.bossState} />
      </div>

      {/* HERO + COMMAND (bottom-left) and DIALOG (bottom-right) band */}
      <div className="absolute inset-x-[2%] bottom-[3%] flex items-end justify-between gap-3 max-md:flex-col max-md:items-start">
        <div className="flex items-end gap-3">
          <CroppedSprite className="h-[min(26vh,190px)] max-md:h-[14vh]" />
          <CommandWindow canAttack={canAttack} onAttack={onAttack} onClose={onClose} />
        </div>
        <DialogWindow
          phase={phase}
          state={state}
          stage={stage}
          damage={MOCK_STAGE_DAMAGE[state.currentStage]}
        />
      </div>

      {state.victory && (
        <div className="absolute inset-0 z-40 grid place-items-center p-4">
          <div className="w-[min(420px,90vw)]">
            <VictoryCard
              eligibleHP={state.finalEligibleHP}
              finalEligibleHP={state.finalEligibleHP}
              prize={state.originalPrize}
              historicalDamage={state.finalEligibleHP}
            />
          </div>
        </div>
      )}

      {state.status === 2 && (
        <div role="status" className="absolute inset-0 z-40 grid place-items-center bg-ink/85">
          <div className="window-chrome px-6 py-3 font-mono">
            <p className="text-lg tracking-[0.3em] text-[#2b4a8b]">STAGE {stage} CLEARED!</p>
          </div>
        </div>
      )}
    </div>
  );
}
