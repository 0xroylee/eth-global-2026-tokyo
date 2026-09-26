/** NAME PLATE zone: navy plate with white text — `ROY` plus the small `LV` tag. */
export function NamePlate({ stage }: { stage: 1 | 2 | 3 }) {
  return (
    <div className="window-title flex items-baseline gap-3 rounded-[2px] border-3 border-[#2b4a8b] px-4 py-2 shadow-[0_4px_0_rgba(20,30,60,0.45)]">
      <span className="font-mono text-sm tracking-[0.15em] text-white">ROY</span>
      <span className="font-mono text-[10px] tracking-[0.15em] text-white/85">LV {stage}</span>
    </div>
  );
}
