"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect } from "react";
import { MOCK_STAGE_DAMAGE, type AttackPhase, type MockBattleState } from "@/lib/mockBattle";
import { BossStage } from "./BossStage";
import { CommandWindow } from "./CommandWindow";
import { CroppedSprite } from "./CroppedSprite";
import { DialogWindow } from "./DialogWindow";
import { NamePlate } from "./NamePlate";
import { BattleMeta, StatusPanel } from "./StatusPanel";
import { VictoryCard } from "./VictoryCard";

const STAGE = [1, 2, 3] as const;

/**
 * Full-screen battle. The boss, status rows, command menu, and dialogue
 * occupy the battlefield; the lake stays behind them.
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
      className="fixed inset-0 z-30 overflow-hidden font-pixel [-webkit-font-smoothing:none]"
    >
      <div aria-hidden className="absolute inset-0 z-0">
        <img
          src="/images/arena-lake-background.png"
          alt=""
          className="size-full object-cover [image-rendering:pixelated]"
        />
      </div>

      <h1 id="battle-title" className="sr-only">
        Pool Unis · Boss Battle
      </h1>

      <div className="absolute left-6 top-7 z-20 w-[44vw]">
        <StatusPanel state={state} />
      </div>

      <div className="absolute right-4 top-12 z-20">
        <NamePlate stage={stage} phase={phase} />
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-2 z-30 bg-[#092B61] px-2 py-1 font-pixel text-[16px] leading-none text-white shadow-[3px_3px_0_#041833] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4ff]"
      >
        ESC · EXIT
      </button>

      <div className="pointer-events-none absolute left-[50%] top-[20%] z-[18] h-[50%] w-[35%] bg-transparent">
        <BossStage stage={stage} state={state.bossState} />
      </div>

      <div className="absolute bottom-[428px] left-6 z-20 flex flex-col gap-2">
        <BattleMeta stage={stage} deadlineAt={deadlineAt} />
        <div className="w-[108px] border-[3px] border-[#f3ead2] bg-[#16356e] px-1.5 pb-1.5 pt-1.5 shadow-[3px_3px_0_#041833] [border-radius:8px]">
          <div className="mx-auto h-[84px] w-[70px] overflow-hidden">
            <CroppedSprite className="h-[140px]" />
          </div>
          <p className="mt-1 text-center font-pixel text-[16px] leading-none text-[#f6e7b2]">YOU</p>
        </div>
      </div>

      <div className="absolute bottom-8 left-6 z-20 h-[360px] w-[36vw]">
        <CommandWindow canAttack={canAttack} onAttack={onAttack} onClose={onClose} />
      </div>

      <div className="absolute bottom-8 left-[54%] right-4 z-20 h-[200px]">
        <DialogWindow phase={phase} state={state} stage={stage} damage={MOCK_STAGE_DAMAGE[state.currentStage]} />
      </div>

      {state.victory && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#041833]/80 p-4">
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
        <div role="status" className="absolute inset-0 z-40 grid place-items-center bg-[#041833]/80">
          <div className="bg-[#092B61] p-1 shadow-[4px_4px_0_#041833]">
            <p className="border-2 border-white bg-[#FFF9E9] px-8 py-4 font-pixel text-[28px] leading-none text-[#092B61]">
              STAGE {stage} CLEARED!
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
