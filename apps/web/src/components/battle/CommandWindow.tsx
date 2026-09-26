import type { Ref } from "react";

const ROW = "flex min-h-11 w-full flex-1 items-center gap-4 px-4 py-2 text-left text-[#092B61] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#8ab4ff] disabled:cursor-not-allowed disabled:text-[#6d7c9c] lg:py-1";

export function CommandWindow({ label, disabled, onAction, onClose, attackButtonRef }: {
  label: string;
  disabled: boolean;
  onAction: () => void;
  onClose: () => void;
  attackButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="h-full bg-[#092B61] p-1 font-pixel shadow-[4px_4px_0_#041833]">
      <div className="flex h-full flex-col border-2 border-white bg-[#FFF9E9]">
        <div lang="ja" className="bg-[#092B61] px-4 py-3 text-[22px] leading-none text-white lg:py-2">コマンド？</div>
        <div className="flex flex-1 flex-col divide-y-4 divide-[#092B61]">
          {[
            { kana: "やく", label, icon: "⚔", disabled, onClick: onAction },
            { kana: "まほう", label: "MAGIC", icon: "✦", disabled: true, title: "Magic is not available." },
            { kana: "アイテム", label: "ITEM", icon: "▣", disabled: true, title: "Inventory is not available." },
            { kana: "にげる", label: "RUN", icon: "➜", disabled: false, onClick: onClose },
          ].map((command) => (
            <button key={command.kana} ref={command.kana === "やく" ? attackButtonRef : undefined} type="button" disabled={command.disabled} title={command.title} onClick={command.onClick} className={`${ROW} ${command.onClick === onAction && !disabled ? "bg-[#DCEEFF]" : ""}`}>
              <span aria-hidden className="grid size-10 shrink-0 place-items-center bg-[#092B61] text-[26px] leading-none text-white lg:size-[clamp(36px,6.2vh,56px)]">{command.icon}</span>
              <span className="flex min-w-0 flex-col items-start gap-1">
                <span lang="ja" className="text-[clamp(12px,1.8vh,16px)] leading-none">{command.kana}</span>
                <span className="text-[clamp(18px,2.9vh,26px)] leading-none">{command.label}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
