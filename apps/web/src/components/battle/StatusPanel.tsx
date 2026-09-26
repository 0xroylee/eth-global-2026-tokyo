"use client";

import { useEffect, useState, type ReactNode } from "react";
import { displayAmount } from "@/lib/format";
import { MOCK_FINAL_ELIGIBLE_HP, type MockBattleState } from "@/lib/mockBattle";

const URGENT_MS = 10 * 60 * 1000;

/** `mm:ss`; minutes are allowed to exceed 59 (deadline = mount + 2h). */
function formatMmSs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function HudRow({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#092B61] p-1 shadow-[4px_4px_0_#041833]">
      <div className="flex items-center gap-3 border-2 border-white bg-[#FFF9E9] px-2 py-2">{children}</div>
    </div>
  );
}

function Label({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-2 bg-[#092B61] px-3 py-2 text-[20px] leading-none text-white">
      <span aria-hidden className="text-[18px] leading-none">
        {icon}
      </span>
      {children}
    </span>
  );
}

/**
 * Three horizontal battle rows: pool title, boss HP, your share.
 * Stage, deadline, and chain stay out of this block.
 */
export function StatusPanel({ state }: { state: MockBattleState }) {
  const cap = state.stageCapacity[state.currentStage];
  const sold = state.stageSold[state.currentStage];
  const remaining = cap > sold ? cap - sold : 0n;
  const hpFraction = cap > 0n ? Number((remaining * 1000n) / cap) / 1000 : 0;
  const hpPct = cap > 0n ? Number((remaining * 100n) / cap) : 0;

  const totalDealt = state.stageSold[0] + state.stageSold[1] + state.stageSold[2];
  const sharePercent =
    totalDealt > 0n ? Math.min(100, Number((totalDealt * 10000n) / MOCK_FINAL_ELIGIBLE_HP) / 100) : 0;
  const shareFraction = sharePercent / 100;
  const shareLabel = Number.isInteger(sharePercent) ? `${sharePercent}%` : `${sharePercent.toFixed(1)}%`;

  return (
    <div className="flex flex-col gap-2 font-pixel">
      <HudRow>
        <Label icon="◆">BOSS POOL</Label>
        <span className="text-[22px] leading-none text-[#092B61]">UNISWAP V4 HACKATHON DEMO</span>
      </HudRow>

      <HudRow>
        <Label icon="⚔">BOSS HP</Label>
        <div
          className="h-8 min-w-0 flex-1 bg-[#092B61]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={hpFraction}
          aria-valuetext={`${displayAmount(remaining, 18)} of ${displayAmount(cap, 18)} HP remaining`}
        >
          <div
            className="h-full w-full origin-left transition-transform duration-300 ease-[var(--ease-out-strong)]"
            style={{ background: "#59C84A", transform: `scaleX(${hpFraction})` }}
          />
        </div>
        <span className="shrink-0 text-[24px] leading-none tabular-nums text-[#092B61]">
          {displayAmount(remaining, 18)} / {displayAmount(cap, 18)} ({hpPct}%)
        </span>
      </HudRow>

      <HudRow>
        <Label icon="💧">YOUR SHARE %</Label>
        <div
          className="h-8 min-w-0 flex-1 bg-[#092B61]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={shareFraction}
          aria-valuetext={`${shareLabel} share`}
        >
          <div
            className="h-full w-full origin-left transition-transform duration-300 ease-[var(--ease-out-strong)]"
            style={{ background: "#55B8F2", transform: `scaleX(${shareFraction})` }}
          />
        </div>
        <span className="shrink-0 text-[24px] leading-none tabular-nums text-[#092B61]">{shareLabel}</span>
      </HudRow>
    </div>
  );
}

/** Secondary line. It must not compete with the boss name. */
export function BattleMeta({
  stage,
  deadlineAt,
}: {
  stage: 1 | 2 | 3;
  deadlineAt: number;
}) {
  const now = useNow();
  const remainingMs = deadlineAt - now;
  const urgent = remainingMs < URGENT_MS;
  return (
    <p className={`bg-[#092B61] px-3 py-1 font-pixel text-[16px] leading-none shadow-[3px_3px_0_#041833] ${urgent ? "text-[#ffb4a8]" : "text-white"}`}>
      STAGE {stage}/3 · ROUND {formatMmSs(remainingMs)} · UNISWAP V4 · NO CHAIN
    </p>
  );
}
