export function TopBar() {
  return (
    <header className="hairline flex h-[82px] items-center justify-between border-b">
      <a
        className="inline-flex items-center gap-[11px] text-xs font-bold tracking-[0.15em] text-fog no-underline"
        href="/"
        aria-label="Boss Pool local arena home"
      >
        <span className="grid size-[30px] place-items-center rounded-[9px] border border-accent-soft/50 text-[10px] tracking-normal text-accent-soft">
          BP
        </span>
        <span>BOSS POOL</span>
      </a>
      <span className="flex items-center gap-[9px] font-mono text-[10px] tracking-[0.12em] text-[#a7b0ca]">
        <span className="size-[7px] rounded-full bg-[#8e9bb9]" aria-hidden="true" />
        LOCAL ARENA
      </span>
    </header>
  );
}
