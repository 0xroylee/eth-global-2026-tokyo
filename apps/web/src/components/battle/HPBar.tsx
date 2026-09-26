import { displayAmount } from "@/lib/format";
import { STAGE_HUES, type BossVisualState } from "@/lib/mockBattle";

/**
 * Remaining HP bar for the current stage. Reuses the `BossEntryPanel` Bar
 * technique: origin-left fill scaled with `transform: scaleX`.
 */
export function HPBar({
  remaining,
  capacity,
  stage,
  state = "idle",
}: {
  remaining: bigint;
  capacity: bigint;
  stage: 1 | 2 | 3;
  state?: BossVisualState;
}) {
  const fraction = capacity > 0n ? Number((remaining * 1000n) / capacity) / 1000 : 0;
  const hue = STAGE_HUES[stage - 1];
  return (
    <div aria-live="polite">
      <div className="mb-2 flex items-baseline justify-between gap-3 font-mono text-[10px] tracking-[0.14em]">
        <span className="text-dim">BOSS HP</span>
        <span className="text-fog">
          {displayAmount(remaining, 18)} / {displayAmount(capacity, 18)} HP
        </span>
      </div>
      <div
        className="h-3 overflow-hidden rounded-full bg-white/8"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={fraction}
        aria-valuetext={`${displayAmount(remaining, 18)} of ${displayAmount(capacity, 18)} HP remaining`}
      >
        <div
          className={`h-full origin-left rounded-full transition-transform duration-300 ease-[var(--ease-out-strong)] ${
            state === "defeated" ? "opacity-60" : ""
          }`}
          style={{ background: hue, transform: `scaleX(${fraction})` }}
        />
      </div>
    </div>
  );
}
