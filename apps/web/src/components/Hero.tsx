export function Hero() {
  return (
    <section className="grid min-h-[390px] grid-cols-1 items-center gap-2.5 px-1 pb-[38px] pt-[52px] md:grid-cols-[1fr_0.8fr] md:pt-[42px]">
      <div>
        <p className="eyebrow mb-4">UNISWAP V4 · LOCAL PROTOTYPE</p>
        <h1 className="text-[clamp(52px,7.5vw,92px)] font-semibold leading-[0.94] tracking-[-0.075em]">
          One pool.
          <br />
          <span className="text-accent">Three stages.</span>
        </h1>
        <p className="mt-6 max-w-[435px] text-[15px] leading-[1.7] text-muted">
          Every hit buys real BossHP. The hook counts purchased HP as damage; tokens stay in player wallets.
        </p>
      </div>
      <BossPlaceholder />
    </section>
  );
}

/** Placeholder until the Phaser arena lands. Pure CSS; no game asset. */
function BossPlaceholder() {
  return (
    <div
      className="relative mx-auto my-[18px] grid size-[220px] place-items-center md:my-0 md:size-[280px]"
      aria-hidden="true"
    >
      <div className="absolute size-[205px] -rotate-[28deg] rounded-full border border-accent/15 border-l-accent/60 border-r-transparent md:size-[254px]" />
      <div className="absolute size-[157px] rotate-[34deg] rounded-full border border-[#b685ff]/30 border-t-transparent md:size-[192px]" />
      <div className="grid h-[112px] w-[99px] place-items-center bg-[linear-gradient(145deg,#3a4c8f,#171d39_65%,#262447)] text-[#dfe6ff] shadow-[0_0_80px_rgba(88,115,227,0.38)] [clip-path:polygon(50%_0,90%_21%,100%_70%,72%_100%,22%_92%,0_51%,12%_16%)] md:h-[142px] md:w-[125px]">
        <span className="font-mono text-[30px] opacity-70">?</span>
      </div>
      <div className="absolute bottom-[5px] font-mono text-[9px] tracking-[0.12em] text-[#7d87a3]">ARENA // 001</div>
    </div>
  );
}
