import { BattleFrame } from "./BattleFrame";

export function NamePlate({ stage, action }: { stage?: 1 | 2 | 3; action: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 font-pixel">
      <div className="min-w-0 flex-1 space-y-2">
        <BattleFrame tone="navy">
          <div className="px-3 py-3 text-center">
            <p lang="ja" className="text-sm">プール・ユニス</p>
            <p className="mt-2 text-xl leading-none sm:text-2xl">Pool Unis</p>
          </div>
        </BattleFrame>
        <BattleFrame tone="navy"><p className="px-2 py-2 text-center text-xs leading-relaxed sm:text-sm">{action}</p></BattleFrame>
      </div>
      <BattleFrame tone="navy"><p className="whitespace-nowrap px-2 py-3 text-base sm:text-xl">LV. {stage ?? "—"}</p></BattleFrame>
    </div>
  );
}
