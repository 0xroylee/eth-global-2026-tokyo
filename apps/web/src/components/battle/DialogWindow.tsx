import { BattleFrame } from "./BattleFrame";

export function DialogWindow({ title, detail }: { title: string; detail: string }) {
  return (
    <BattleFrame className="font-pixel">
      <div aria-live="polite" className="flex min-h-[150px] flex-col justify-center px-4 py-4 sm:px-5">
        <p className="break-words text-sm leading-relaxed sm:text-lg">{title}</p>
        <p className="mt-3 break-words text-xs leading-relaxed sm:text-sm">{detail}</p>
      </div>
    </BattleFrame>
  );
}
