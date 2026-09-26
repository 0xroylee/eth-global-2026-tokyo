/** NAME PLATE zone: navy plate with white text — `Attack Token` plus the small `LV` tag. */
export function NamePlate({ stage }: { stage: 1 | 2 | 3 }) {
  return (
    <div className="window-title flex max-w-[46vw] flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[2px] border-3 border-[#2b4a8b] px-4 py-2 shadow-[0_4px_0_rgba(20,30,60,0.45)]">
      <span className="font-mono text-sm tracking-[0.15em] text-white">Attack Token</span>
      <span className="whitespace-nowrap font-mono text-[10px] tracking-[0.15em] text-white/85">LV {stage}</span>
    </div>
  );
}
