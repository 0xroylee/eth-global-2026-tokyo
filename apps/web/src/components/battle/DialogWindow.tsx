export function DialogWindow({ title, detail }: { title: string; detail: string }) {
  return (
    <div aria-live="polite" className="window-chrome w-[min(46vw,520px)] max-md:w-[94vw] px-4 py-3 font-mono">
      <p className="text-[12px] leading-relaxed tracking-[0.14em] text-[#2b4a8b]">{title}</p>
      <p className="break-words text-[11px] leading-relaxed tracking-[0.1em] text-[#2b4a8b]/80">{detail}</p>
    </div>
  );
}
