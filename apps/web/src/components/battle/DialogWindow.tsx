import { displayAmount } from "@/lib/format";
import type { AttackPhase, MockBattleState } from "@/lib/mockBattle";

/**
 * Copy state machine (uiux-battle v2 §4.3). Priority:
 * victory > status===2 > confirmed > other phases; idle is the fallback.
 */
function pickLines(phase: AttackPhase, state: MockBattleState, stage: number, damage: bigint): [string, string] {
  if (state.victory) return ["BOSS DEFEATED!", "Reward preview is ready."];
  if (state.status === 2) return [`STAGE ${stage} CLEARED!`, `Stage ${stage + 1} begins — HP restored.`];
  if (phase === "confirmed") return [`HIT CONFIRMED · −${displayAmount(damage, 18)} HP`, "Boss HP updated."];
  switch (phase) {
    case "simulate":
      return ["SIMULATING…", "Checking the attack against the stage."];
    case "sign":
      return ["AWAITING SIGNATURE…", "Confirm in your wallet."];
    case "submit":
      return ["SUBMITTED…", "Waiting for the receipt…"];
    default:
      return ["Attack Token appeared!", "Choose a command."];
  }
}

/** DIALOG zone: fixed two-line message window announcing phase progress. */
export function DialogWindow({
  phase,
  state,
  stage,
  damage,
}: {
  phase: AttackPhase;
  state: MockBattleState;
  stage: 1 | 2 | 3;
  damage: bigint;
}) {
  const [line1, line2] = pickLines(phase, state, stage, damage);
  return (
    <div
      aria-live="polite"
      className="window-chrome w-[min(46vw,520px)] max-md:w-[94vw] px-4 py-3 font-mono"
    >
      <p className="text-[12px] leading-relaxed tracking-[0.14em] text-[#2b4a8b]">{line1}</p>
      <p className="text-[11px] leading-relaxed tracking-[0.1em] text-[#2b4a8b]/80">{line2}</p>
    </div>
  );
}
