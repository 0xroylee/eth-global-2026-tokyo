"use client";

import { useEffect, useState } from "react";
import { displayAmount } from "@/lib/format";
import { MOCK_FINAL_ELIGIBLE_HP, STAGE_HUES, type MockBattleState } from "@/lib/mockBattle";
import { MockBadge } from "./MockBadge";

const HP_FILL = "#57c858";
const SHARE_FILL = "#a9d6ff";
const NAVY = "#2b4a8b";
const URGENT_MS = 10 * 60 * 1000;

/** `mm:ss`; minutes are allowed to exceed 59 (deadline = mount + 2h). */
function formatMmSs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * STATUS zone: boss HP bar, your share bar and the chip row (stage dots,
 * round deadline, mock badge). Pure display; data arrives via props.
 */
export function StatusPanel({
  state,
  stage,
  deadlineAt,
}: {
  state: MockBattleState;
  stage: 1 | 2 | 3;
  deadlineAt: number;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const cap = state.stageCapacity[state.currentStage];
  const sold = state.stageSold[state.currentStage];
  const remaining = cap > sold ? cap - sold : 0n;
  const hpFraction = cap > 0n ? Number((remaining * 1000n) / cap) / 1000 : 0;
  const hpPct = cap > 0n ? Number((remaining * 100n) / cap) : 0;

  const totalDealt = state.stageSold[0] + state.stageSold[1] + state.stageSold[2];
  const sharePercent =
    totalDealt > 0n
      ? Math.min(100, Number((totalDealt * 10000n) / MOCK_FINAL_ELIGIBLE_HP) / 100)
      : 0;
  const shareFraction = sharePercent / 100;

  const remainingMs = deadlineAt - now;
  const urgent = remainingMs < URGENT_MS;

  return (
    <div className="window-chrome flex flex-col gap-2 px-3 py-2.5 font-mono">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="text-[10px] tracking-[0.14em]" style={{ color: NAVY }}>
          BOSS HP
        </span>
        <span className="text-[10px] tracking-[0.08em] tabular-nums" style={{ color: NAVY }}>
          {displayAmount(remaining, 18)}/{displayAmount(cap, 18)} ({hpPct}%)
        </span>
      </div>
      <div
        className="bar-track h-3 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={hpFraction}
        aria-valuetext={`${displayAmount(remaining, 18)} of ${displayAmount(cap, 18)} HP remaining`}
      >
        <div
          className="h-full w-full origin-left transition-transform duration-300 ease-[var(--ease-out-strong)]"
          style={{ background: HP_FILL, transform: `scaleX(${hpFraction})` }}
        />
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-x-2 pt-1">
        <span className="text-[10px] tracking-[0.14em]" style={{ color: NAVY }}>
          YOUR SHARE
        </span>
        <span className="text-[10px] tracking-[0.08em] tabular-nums" style={{ color: NAVY }}>
          {sharePercent}%
        </span>
      </div>
      <div
        className="bar-track h-2.5 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={shareFraction}
        aria-valuetext={`${sharePercent}% share`}
      >
        <div
          className="h-full w-full origin-left transition-transform duration-300 ease-[var(--ease-out-strong)]"
          style={{ background: SHARE_FILL, transform: `scaleX(${shareFraction})` }}
        />
      </div>

      {/* 純資訊 chip 列：不掛 live region——ROUND DEADLINE 每秒更新會令 SR 每秒廣播；動態宣告由 DialogWindow 承擔（smith M-1） */}
      <div className="mt-1 flex flex-col gap-1.5 border-t-2 border-[#2b4a8b]/20 pt-1.5">
        <span className="flex flex-wrap items-center justify-between gap-x-2 rounded-full border border-[#2b4a8b]/40 px-2 py-0.5 text-[10px] tracking-[0.12em] text-[#2b4a8b]">
          <span>STAGE {stage} / 3</span>
          <span className="flex items-center gap-1" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className="size-1.5 rounded-full"
                style={{ background: n === stage ? STAGE_HUES[stage - 1] : "rgba(43,74,139,0.25)" }}
              />
            ))}
          </span>
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-2 rounded-full border border-[#2b4a8b]/40 px-2 py-0.5 text-[10px] tracking-[0.12em] text-[#2b4a8b]">
          <span>ROUND DEADLINE</span>
          <span className={`tabular-nums ${urgent ? "text-[#c0392b]" : ""}`}>{formatMmSs(remainingMs)}</span>
        </span>
        <MockBadge />
      </div>
    </div>
  );
}
