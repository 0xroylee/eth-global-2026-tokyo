import { displayAmount } from "@/lib/format";
import type { AttackPhase, MockBattleState } from "@/lib/mockBattle";

/**
 * Copy state machine. Priority: victory, stage clear, confirmed hit, then the
 * in-flight phase. Idle introduces Pool Unis.
 */
function pickLines(phase: AttackPhase, state: MockBattleState, stage: number, damage: bigint): [string, string, string] {
  if (state.victory) return ["BOSS DEFEATED!", "Reward preview is ready.", ""];
  if (state.status === 2) return [`STAGE ${stage} CLEARED!`, `Stage ${stage + 1} begins — HP restored.`, ""];
  if (phase === "confirmed") return [`HIT CONFIRMED · −${displayAmount(damage, 18)} HP`, "Boss HP updated.", ""];
  switch (phase) {
    case "simulate":
      return ["SIMULATING…", "Checking the attack against the stage.", ""];
    case "sign":
      return ["AWAITING SIGNATURE…", "Confirm in your wallet.", ""];
    case "submit":
      return ["SUBMITTED…", "Waiting for the receipt…", ""];
    default:
      return ["流動性の泉の守護者！", "Guardian of the Liquidity Spring!", "Its fees push challengers away..."];
  }
}

/** Large cream dialogue window on the lower right of the battlefield. */
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
  const [line1, line2, line3] = pickLines(phase, state, stage, damage);
  return (
    <div aria-live="polite" className="h-full bg-[#092B61] p-1 font-pixel shadow-[4px_4px_0_#041833]">
      <div className="flex h-full flex-col justify-center border-2 border-white bg-[#FFF9E9] px-5 py-3 text-[#092B61]">
        <p className="text-[24px] leading-snug">{line1}</p>
        <p className="mt-3 text-[22px] leading-snug">{line2}</p>
        {line3 ? <p className="mt-2 text-[22px] leading-snug">{line3}</p> : null}
      </div>
    </div>
  );
}
