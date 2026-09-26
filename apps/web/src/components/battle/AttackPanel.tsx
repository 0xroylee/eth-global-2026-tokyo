import { displayAmount } from "@/lib/format";
import type { AttackPhase } from "@/lib/mockBattle";

const STEPS = ["SIMULATE", "SIGN", "SUBMIT", "CONFIRM"] as const;

const PHASE_INDEX: Record<AttackPhase, number> = {
  idle: -1,
  simulate: 0,
  sign: 1,
  submit: 2,
  confirmed: 3,
};

const PROGRESS_TEXT: Record<Exclude<AttackPhase, "idle" | "confirmed">, string> = {
  simulate: "SIMULATING…",
  sign: "AWAITING SIGNATURE…",
  submit: "SUBMITTED…",
};

/** MOCK ATTACK button plus the fixed four-step phase list. */
export function AttackPanel({
  phase,
  damage,
  canAttack,
  onAttack,
}: {
  phase: AttackPhase;
  damage: bigint;
  canAttack: boolean;
  onAttack: () => void;
}) {
  const current = PHASE_INDEX[phase];
  const disabled = phase !== "idle" || !canAttack;

  return (
    <div className="panel-enter rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
      <button
        type="button"
        autoFocus
        disabled={disabled}
        onClick={onAttack}
        className="min-h-[44px] w-full rounded-xl border border-accent/25 bg-accent/20 px-4 py-3 font-mono text-[12px] tracking-[0.18em] text-accent-soft transition-transform duration-150 ease-[var(--ease-out-strong)] focus-visible:outline-2 focus-visible:outline-[#8ab4ff] hover:bg-accent/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        MOCK ATTACK
      </button>

      <div className="mt-4" aria-live="polite">
        <ol className="grid grid-cols-4 gap-1.5">
          {STEPS.map((label, index) => {
            const done = index < current;
            const active = index === current;
            return (
              <li
                key={label}
                className={`rounded-md border px-1 py-1.5 text-center font-mono text-[8px] tracking-[0.12em] ${
                  active
                    ? "border-accent/40 bg-accent/15 text-accent-soft"
                    : done
                      ? "border-white/12 text-dim"
                      : "border-white/8 text-faint"
                }`}
              >
                {label}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 min-h-[15px] font-mono text-[10px] tracking-[0.14em] text-muted">
          {phase === "confirmed"
            ? `HIT CONFIRMED · −${displayAmount(damage, 18)} HP`
            : phase !== "idle"
              ? PROGRESS_TEXT[phase]
              : "\u00A0"}
        </p>
      </div>
    </div>
  );
}
