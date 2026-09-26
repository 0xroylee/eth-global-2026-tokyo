import { STAGE_HUES } from "@/lib/mockBattle";

/** `STAGE N / 3` eyebrow text plus three dots; text is always visible. */
export function StageIndicator({ stage }: { stage: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center justify-between" aria-live="polite">
      <span className="eyebrow">STAGE {stage} / 3</span>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className="size-1.5 rounded-full"
            style={{ background: n === stage ? STAGE_HUES[stage - 1] : "rgba(255,255,255,0.16)" }}
          />
        ))}
      </div>
    </div>
  );
}
