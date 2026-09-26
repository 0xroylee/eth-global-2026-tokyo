"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { findBoss, type BossId } from "@/game/bosses";
import { GameBridge } from "@/game/bridge";
import { useLocalRound, type DeploymentState } from "@/lib/useLocalRound";
import { BossEntryPanel } from "./BossEntryPanel";
import { GameCanvas } from "./GameCanvas";
import { RoundStatePanel } from "./RoundStatePanel";
import { WalletControl } from "./WalletControl";

export function GameShell() {
  const bridge = useMemo(() => new GameBridge(), []);
  const deployment = useLocalRound();
  const [nearBoss, setNearBoss] = useState<BossId | null>(null);
  const [openBoss, setOpenBoss] = useState<BossId | null>(null);
  const [showChain, setShowChain] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);

  useEffect(() => {
    const offNear = bridge.on("gate:near", ({ bossId }) => setNearBoss(bossId));
    const offEnter = bridge.on("gate:enter", ({ bossId }) => setOpenBoss(bossId));
    return () => {
      offNear();
      offEnter();
      bridge.clear();
    };
  }, [bridge]);

  useEffect(() => {
    bridge.send("ui:modal", { open: openBoss !== null || showChain || walletModalOpen });
  }, [bridge, openBoss, showChain, walletModalOpen]);

  const closeBoss = useCallback(() => setOpenBoss(null), []);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-4 md:px-[38px]">
      <Hud
        deployment={deployment}
        onToggleChain={() => setShowChain((v) => !v)}
        chainOpen={showChain}
        onWalletModalChange={setWalletModalOpen}
      />

      <section className="relative mt-3">
        <GameCanvas bridge={bridge} />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="rounded-md border border-[#f5b04a]/40 bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-[#f5b04a]">
            HUB · FIXTURE MAP
          </span>
          <span className="rounded-md bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-dim">
            HUB // 001
          </span>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
          <span className="rounded-md bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.14em] text-dim">
            WASD / ARROWS · MOVE
          </span>
          <GatePrompt bossId={nearBoss} hidden={openBoss !== null} />
        </div>

        {openBoss && <BossEntryPanel boss={findBoss(openBoss)} deployment={deployment} onClose={closeBoss} />}
      </section>

      {showChain && (
        <div className="mt-4">
          <RoundStatePanel />
        </div>
      )}

      <footer className="mt-auto flex flex-col justify-between gap-2 py-5 font-mono text-[9px] tracking-[0.12em] text-faint md:flex-row">
        <span>NO MOCK DAMAGE · NO BURN · LOCAL CHAIN ONLY</span>
        <span>ROUND STATE REFRESHES EVERY 5 SECONDS</span>
      </footer>
    </main>
  );
}

function Hud({
  deployment,
  chainOpen,
  onToggleChain,
  onWalletModalChange,
}: {
  deployment: DeploymentState;
  chainOpen: boolean;
  onToggleChain: () => void;
  onWalletModalChange: (open: boolean) => void;
}) {
  const live = deployment.kind === "live";
  const label =
    deployment.kind === "loading" ? "CHECKING" : live ? "LIVE" : deployment.kind === "error" ? "RPC ERROR" : "NOT DEPLOYED";
  return (
    <header className="hairline flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-2">
      <a className="inline-flex items-center gap-[11px] text-xs font-bold tracking-[0.15em] text-fog no-underline" href="/">
        <span className="grid size-[30px] place-items-center rounded-[9px] border border-accent-soft/50 text-[10px] tracking-normal text-accent-soft">
          BP
        </span>
        <span>BOSS POOL</span>
      </a>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Round pill reports the local contract read; the wallet control reports Base Sepolia. Keep them visibly separate. */}
        <button
          type="button"
          onClick={onToggleChain}
          aria-pressed={chainOpen}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-[9px] tracking-[0.12em] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97] ${
            live ? "border-live/25 text-live-soft" : "border-white/12 text-[#9da8c3]"
          }`}
        >
          <span
            className={`size-[7px] rounded-full ${live ? "bg-live shadow-[0_0_12px_rgba(79,218,165,0.55)]" : "bg-[#8e9bb9]"}`}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">ROUND · LOCAL · </span>
          {label}
          <span aria-hidden="true" className="text-dim">
            {chainOpen ? "▴" : "▾"}
          </span>
        </button>
        <WalletControl onModalChange={onWalletModalChange} />
      </div>
    </header>
  );
}

function GatePrompt({ bossId, hidden }: { bossId: BossId | null; hidden: boolean }) {
  const boss = bossId ? findBoss(bossId) : null;
  const visible = boss !== null && !hidden;
  return (
    <span
      aria-live="polite"
      className={`rounded-md border border-white/12 bg-ink/85 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-fog transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)] ${
        visible ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0"
      }`}
    >
      {boss ? (boss.locked ? "E · INSPECT LOCKED GATE" : `E · ENTER ${boss.name.toUpperCase()}`) : ""}
    </span>
  );
}
