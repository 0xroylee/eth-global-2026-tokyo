"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { findBoss, type BossId } from "@/game/bosses";
import { GameBridge } from "@/game/bridge";
import { useLocalRound, type DeploymentState } from "@/lib/useLocalRound";
import { useHubGuide } from "@/lib/useHubGuide";
import { BossEntryPanel } from "./BossEntryPanel";
import { GameCanvas, type CanvasPhase } from "./GameCanvas";
import { HubGuide, ReplayGuide } from "./HubGuide";
import { HubHelp } from "./HubHelp";
import { HubRouteNotice } from "./HubRouteNotice";
import { RoundStatePanel } from "./RoundStatePanel";
import { HubSoundControl } from "./HubSoundControl";

export function GameShell() {
  const bridge = useMemo(() => new GameBridge(), []);
  const deployment = useLocalRound();
  const [nearBoss, setNearBoss] = useState<BossId | null>(null);
  const [openBoss, setOpenBoss] = useState<BossId | null>(null);
  const [showChain, setShowChain] = useState(false);
  const [nearRoute, setNearRoute] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [canvasPhase, setCanvasPhase] = useState<CanvasPhase>("loading");
  const guide = useHubGuide(bridge, nearBoss);
  const welcomeOpen = guide.hydrated && guide.state.step === "welcome" && canvasPhase !== "error";
  const overlayOpen = openBoss !== null || showChain || welcomeOpen || routeOpen || helpOpen;

  useEffect(() => {
    const offNear = bridge.on("gate:near", ({ bossId }) => setNearBoss(bossId));
    const offEnter = bridge.on("gate:enter", ({ bossId }) => setOpenBoss(bossId));
    const offRouteNear = bridge.on("region:near", ({ exitId }) => setNearRoute(exitId !== null));
    const offRouteInspect = bridge.on("region:inspect", () => setRouteOpen(true));
    return () => {
      offNear();
      offEnter();
      offRouteNear();
      offRouteInspect();
    };
  }, [bridge]);

  useEffect(() => {
    guide.syncModal(overlayOpen);
    bridge.send("ui:modal", { open: overlayOpen });
  }, [bridge, guide.syncModal, overlayOpen]);

  useEffect(() => {
    if (openBoss) guide.panelOpened(openBoss);
  }, [guide.panelOpened, openBoss]);

  const closeBoss = useCallback(() => setOpenBoss(null), []);
  const closeRoute = useCallback(() => setRouteOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const replayFromHelp = useCallback(() => {
    setHelpOpen(false);
    guide.replay();
  }, [guide.replay]);
  const hintStep = guide.state.step;
  const showHint =
    guide.hydrated &&
    canvasPhase !== "error" &&
    !overlayOpen &&
    (hintStep === "move" || hintStep === "find" || hintStep === "inspect" || hintStep === "done");
  const guideInspect = showHint && hintStep === "inspect";
  const showBossPrompt = nearBoss !== null && !overlayOpen && !guideInspect;
  const showRoutePrompt = nearRoute && !showBossPrompt && !overlayOpen && !guideInspect;

  return (
    <main className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-4 md:px-[38px]">
      <Hud deployment={deployment} onToggleChain={() => setShowChain((v) => !v)} chainOpen={showChain} />

      <div className="mt-4 flex items-baseline gap-3">
        <h1 className="text-sm font-semibold tracking-[0.14em] text-fog">GARDEN HUB</h1>
        <p className="font-mono text-[10px] tracking-[0.16em] text-dim">REGION 01</p>
      </div>

      <section className="relative mt-3">
        <GameCanvas bridge={bridge} onPhase={setCanvasPhase} />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="rounded-md border border-[#f5b04a]/40 bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-[#f5b04a]">
            HUB · FIXTURE MAP
          </span>
          <HubSoundControl bridge={bridge} />
        </div>

        {canvasPhase !== "error" && (
          <HubGuide
            step={guide.hydrated ? guide.state.step : "hidden"}
            showHint={showHint}
            onStart={guide.start}
            onSkip={guide.skip}
            onDismiss={guide.dismiss}
          />
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
          <span className="rounded-md bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.14em] text-dim">
            WASD / ARROWS · MOVE
          </span>
          <GatePrompt bossId={nearBoss} hidden={!showBossPrompt} />
          <RoutePrompt hidden={!showRoutePrompt} />
        </div>

        {openBoss && <BossEntryPanel boss={findBoss(openBoss)} deployment={deployment} onClose={closeBoss} />}
        {routeOpen && <HubRouteNotice onClose={closeRoute} />}
        {helpOpen && <HubHelp onClose={closeHelp} onReplay={replayFromHelp} />}
      </section>

      {showChain && (
        <div className="mt-4">
          <RoundStatePanel />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          disabled={overlayOpen || canvasPhase === "error"}
          className="rounded-md border border-white/12 px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-dim transition-opacity duration-150 hover:text-fog disabled:opacity-40 motion-reduce:transition-none"
        >
          HELP
        </button>
        {guide.hydrated && guide.state.step !== "welcome" && <ReplayGuide disabled={overlayOpen} onReplay={guide.replay} />}
      </div>

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
}: {
  deployment: DeploymentState;
  chainOpen: boolean;
  onToggleChain: () => void;
}) {
  const live = deployment.kind === "live";
  const label =
    deployment.kind === "loading" ? "CHECKING" : live ? "LIVE" : deployment.kind === "error" ? "RPC ERROR" : "NOT DEPLOYED";
  return (
    <header className="hairline flex h-16 items-center justify-between border-b">
      <a className="inline-flex items-center gap-[11px] text-xs font-bold tracking-[0.15em] text-fog no-underline" href="/">
        <span className="grid size-[30px] place-items-center rounded-[9px] border border-accent-soft/50 text-[10px] tracking-normal text-accent-soft">
          BP
        </span>
        <span>BOSS POOL</span>
      </a>
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
        CHAIN · {label}
        <span aria-hidden="true" className="text-dim">
          {chainOpen ? "▴" : "▾"}
        </span>
      </button>
    </header>
  );
}

function GatePrompt({ bossId, hidden }: { bossId: BossId | null; hidden: boolean }) {
  const boss = bossId ? findBoss(bossId) : null;
  const visible = boss !== null && !hidden;
  return (
    <span
      aria-live="polite"
      aria-hidden={!visible}
      className={`rounded-md border border-white/12 bg-ink/85 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-fog transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)] ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none absolute translate-y-1 opacity-0"
      }`}
    >
      {visible && boss ? (boss.locked ? "E · INSPECT LOCKED GATE" : `E · ENTER ${boss.name.toUpperCase()}`) : ""}
    </span>
  );
}

function RoutePrompt({ hidden }: { hidden: boolean }) {
  return (
    <span
      aria-live="polite"
      aria-hidden={hidden}
      className={`rounded-md border border-[#c48a45]/50 bg-ink/85 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] text-[#f3e2c4] transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)] ${
        hidden ? "pointer-events-none absolute translate-y-1 opacity-0" : "translate-y-0 opacity-100"
      }`}
    >
      {hidden ? "" : "E · INSPECT ROUTE"}
    </span>
  );
}
