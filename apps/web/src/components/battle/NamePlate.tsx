import type { AttackPhase } from "@/lib/mockBattle";
import { BattleFrame } from "./BattleFrame";

function actionCopy(phase: AttackPhase): string {
  switch (phase) {
    case "simulate":
      return "けいさん / SIMULATE";
    case "sign":
      return "サイン / SIGN";
    case "submit":
      return "そうしん / SUBMIT";
    case "confirmed":
      return "ヒット / HIT";
    default:
      return "たおす / ATTACK";
  }
}

/** Boss identity above the sprite: name, level, and the current action. */
export function NamePlate({ stage, phase }: { stage: 1 | 2 | 3; phase: AttackPhase }) {
  return (
    <div className="flex items-start gap-3 font-pixel">
      <div className="flex flex-col items-center gap-3">
        <BattleFrame tone="navy" className="min-w-[240px]">
          <div className="px-4 py-3 text-center">
            <p className="text-[18px] leading-none">プール・ユニス</p>
            <p className="mt-2 text-[30px] leading-none">Pool Unis</p>
          </div>
        </BattleFrame>
        <BattleFrame tone="navy">
          <p className="px-4 py-2 text-center text-[22px] leading-none">{actionCopy(phase)}</p>
        </BattleFrame>
      </div>
      <BattleFrame tone="navy">
        <p className="px-4 py-3 text-[28px] leading-none">LV. {stage}</p>
      </BattleFrame>
    </div>
  );
}
