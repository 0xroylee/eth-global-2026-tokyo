import { BattleFrame } from "./BattleFrame";

const ROW = "flex min-h-[76px] w-full items-center gap-3 px-3 py-3 text-left text-[#092B61] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#8ab4ff] disabled:cursor-not-allowed disabled:text-[#6d7c9c]";

export function CommandWindow({ label, disabled, onAction, onClose }: {
  label: string;
  disabled: boolean;
  onAction: () => void;
  onClose: () => void;
}) {
  return (
    <BattleFrame className="font-pixel">
      <div className="bg-[#092B61] px-4 py-3 text-base leading-none text-white"><span lang="ja">コマンド</span> · COMMAND</div>
      <div className="divide-y-4 divide-[#092B61]">
        <button type="button" disabled={disabled} onClick={onAction} className={`${ROW} ${disabled ? "" : "bg-[#DCEEFF]"}`}>
          <span aria-hidden className="grid size-10 shrink-0 place-items-center bg-[#092B61] text-2xl text-white">⚔</span>
          <span className="min-w-0"><span lang="ja" className="block text-xs">こうげき</span><span className="block text-lg leading-snug sm:text-xl">{label}</span></span>
        </button>
        <button type="button" onClick={onClose} className={ROW}>
          <span aria-hidden className="grid size-10 shrink-0 place-items-center bg-[#092B61] text-2xl text-white">➜</span>
          <span><span lang="ja" className="block text-xs">にげる</span><span className="block text-lg sm:text-xl">RUN</span></span>
        </button>
      </div>
    </BattleFrame>
  );
}
