import { BattleFrame } from "./BattleFrame";
import type { BossPresentation } from "@/game/bosses";

export function NamePlate({ stage, action, presentation }: {
  stage?: 1 | 2 | 3;
  action: string;
  presentation?: BossPresentation;
}) {
  const name = presentation?.name ?? "Unknown Boss";
  return (
    <div className="flex min-w-0 items-start gap-3 font-pixel">
      <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
        <BattleFrame tone="navy" className="w-full lg:min-w-[240px]">
          <div className="px-4 py-3 text-center">
            {presentation?.japaneseName && <p lang="ja" className="text-sm leading-none lg:text-[18px]">{presentation.japaneseName}</p>}
            <p className={`${presentation?.japaneseName ? "mt-2" : ""} text-xl leading-none sm:text-2xl lg:text-[30px]`}>{name}</p>
          </div>
        </BattleFrame>
        <BattleFrame tone="navy"><p className="px-4 py-2 text-center text-xs leading-none sm:text-sm lg:text-[22px]">{action}</p></BattleFrame>
      </div>
      <BattleFrame tone="navy"><p className="whitespace-nowrap px-4 py-3 text-base leading-none sm:text-xl lg:text-[28px]">LV. {stage ?? "—"}</p></BattleFrame>
    </div>
  );
}
