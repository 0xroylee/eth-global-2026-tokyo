export function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5">
      <span className="font-mono text-[9px] tracking-[0.1em] text-dim">{label}</span>
      <strong className="text-lg font-medium tracking-[-0.03em] text-fog [overflow-wrap:anywhere]">
        {value}
      </strong>
      {detail && (
        <span className="font-mono text-[9px] text-[#929bb1] [overflow-wrap:anywhere]">{detail}</span>
      )}
    </div>
  );
}
