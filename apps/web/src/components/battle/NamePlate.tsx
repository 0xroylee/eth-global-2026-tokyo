import { BattleFrame } from "./BattleFrame";

export function NamePlate({ stage, action }: { stage?: 1 | 2 | 3; action: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 font-pixel">
      <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
        <BattleFrame tone="navy" className="w-full lg:min-w-[240px]">
          <div className="px-4 py-3 text-center">
            <p lang="ja" className="text-sm leading-none lg:text-[18px]">プール・ユニス</p>
            <p className="mt-2 text-xl leading-none sm:text-2xl lg:text-[30px]">Pool Unis</p>
          </div>
        </BattleFrame>
        <BattleFrame tone="navy"><p className="px-4 py-2 text-center text-xs leading-none sm:text-sm lg:text-[22px]">{action}</p></BattleFrame>
      </div>
      <BattleFrame tone="navy"><p className="whitespace-nowrap px-4 py-3 text-base leading-none sm:text-xl lg:text-[28px]">LV. {stage ?? "—"}</p></BattleFrame>
    </div>
  );
}
