import { Hero } from "@/components/Hero";
import { RoundStatePanel } from "@/components/RoundStatePanel";
import { TopBar } from "@/components/TopBar";

export default function ArenaPage() {
  return (
    <main className="mx-auto max-w-[1180px] px-5 md:px-[38px]">
      <TopBar />
      <Hero />
      <RoundStatePanel />
      <footer className="flex flex-col justify-between gap-3 px-0.5 py-[22px] font-mono text-[9px] tracking-[0.12em] text-faint md:flex-row">
        <span>NO MOCK DAMAGE · NO BURN · LOCAL CHAIN ONLY</span>
        <span>ROUND STATE REFRESHES EVERY 5 SECONDS</span>
      </footer>
    </main>
  );
}
