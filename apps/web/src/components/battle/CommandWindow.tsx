import type { Ref } from "react";
import { ATTACK_CAPS, type AttackCap } from "@/lib/attackCommand";
import { displayEstimate } from "@/lib/format";
import type { AttackQuotePreview } from "../BossActions";

const ROW = "flex min-h-11 w-full flex-1 items-center gap-4 px-4 py-2 text-left text-[#092B61] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[#8ab4ff] disabled:cursor-not-allowed disabled:text-[#6d7c9c] lg:py-1";

export function CommandWindow({ selectedCap, preview, status, disabled, onAction, onClose, attackButtonRef }: {
  selectedCap: AttackCap;
  preview: AttackQuotePreview;
  status: string;
  disabled: boolean;
  onAction: (cap: AttackCap) => void;
  onClose: () => void;
  attackButtonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div className="h-full bg-[#092B61] p-1 font-pixel shadow-[4px_4px_0_#041833]">
      <div className="flex h-full flex-col border-2 border-white bg-[#FFF9E9]">
        <div lang="ja" className="bg-[#092B61] px-4 py-3 text-[22px] leading-none text-white lg:py-2">コマンド？</div>
        <div className="flex min-h-0 flex-1 flex-col divide-y-4 divide-[#092B61] overflow-y-auto">
          {ATTACK_CAPS.map((cap) => {
            const selected = cap === selectedCap;
            const quote = preview.quotes[cap];
            const label = cap === 1 ? "SWAP ATTACK" : `${cap}× SWAP ATTACK`;
            return (
              <button
                key={cap}
                ref={selected ? attackButtonRef : undefined}
                type="button"
                aria-pressed={selected}
                disabled={disabled || !quote}
                aria-busy={!disabled && !quote && !preview.errors[cap]}
                onClick={() => onAction(cap)}
                className={`${ROW} ${selected ? "bg-[#DCEEFF]" : "bg-[#FFF9E9]"}`}
              >
                <span aria-hidden className="grid size-10 shrink-0 place-items-center bg-[#092B61] text-[26px] leading-none text-white lg:size-[clamp(36px,6.2vh,56px)]">⚔</span>
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <span lang="ja" className="text-[clamp(12px,1.8vh,16px)] leading-none">{cap === 1 ? "こうげき" : `${cap}ばい`}</span>
                  <span className="whitespace-nowrap text-[clamp(14px,2.35vh,20px)] leading-none">{label}</span>
                  <span className="break-words font-system text-[8px] leading-tight antialiased sm:text-[9px]">
                    {quote
                      ? `≈ ${displayEstimate(quote.mockUSDSpent, 6)} MockUSD → ${displayEstimate(quote.bossHPOut, preview.outputDecimals)} ${preview.outputSymbol}${selected ? ` · ${status}` : ""}`
                      : disabled ? "UNAVAILABLE" : preview.errors[cap] ? "QUOTE UNAVAILABLE · RETRYING" : "LOADING QUOTE…"}
                  </span>
                </span>
              </button>
            );
          })}
          <button type="button" onClick={onClose} className={`${ROW} bg-[#FFF9E9]`}>
            <span aria-hidden className="grid size-10 shrink-0 place-items-center bg-[#092B61] text-[26px] leading-none text-white lg:size-[clamp(36px,6.2vh,56px)]">➜</span>
            <span className="flex min-w-0 flex-col items-start gap-1">
              <span lang="ja" className="text-[clamp(12px,1.8vh,16px)] leading-none">にげる</span>
              <span className="text-[clamp(18px,2.9vh,26px)] leading-none">RUN</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
