"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDefaultBossHook, type Address, type DeploymentManifest } from "@boss-pool/chain";
import { confirmedBattleAttack } from "@/lib/battle";
import { findBoss, type BossId } from "@/game/bosses";
import { GameBridge, hubStageProgress } from "@/game/bridge";
import { useHubGuide } from "@/lib/useHubGuide";
import type { useBossPool, NetworkKey } from "@/lib/useBossPool";
import { useArena } from "./BossPoolProvider";
import { BossEntryPanel } from "./BossEntryPanel";
import { FullscreenControl } from "./FullscreenControl";
import { GameCanvas, type CanvasPhase } from "./GameCanvas";
import { HubGuide, ReplayGuide } from "./HubGuide";
import { HubHelp } from "./HubHelp";
import { HubRouteNotice } from "./HubRouteNotice";
import { HubSoundControl } from "./HubSoundControl";
import { RoundStatePanel } from "./RoundStatePanel";

export function GameShell() {
  const bridge = useMemo(() => new GameBridge(), []);
  const shellRef = useRef<HTMLElement>(null);
  const arena = useArena();
  const { deployment, writeState } = arena;
  const [nearBoss, setNearBoss] = useState<BossId | null>(null);
  const [openBoss, setOpenBoss] = useState<BossId | null>(null);
  const [showChain, setShowChain] = useState(false);
  const [nearRoute, setNearRoute] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [canvasPhase, setCanvasPhase] = useState<CanvasPhase>("loading");
  const guide = useHubGuide(bridge, nearBoss);
  const welcomeOpen = guide.hydrated && guide.state.step === "welcome" && canvasPhase !== "error";
  const gameDialogOpen = openBoss !== null || showChain || welcomeOpen || routeOpen || helpOpen;
  const overlayOpen = gameDialogOpen || Boolean(arena.wallet.busy);

  useEffect(() => {
    arena.selectDefaultEncounter(arena.network);
  }, [arena.network, arena.selectDefaultEncounter]); // Returning from a direct battle restores the hub's registered demo Hook.

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
    const onMove = (event: KeyboardEvent) => {
      const wasd = /^[wasd]$/i.test(event.key);
      const arrow = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key);
      if ((!wasd && !arrow) || event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (arena.wallet.busy || writeState.status === "prompting" || canvasPhase !== "ready") return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]')) return;
      if (!gameDialogOpen && target?.closest('[role="dialog"], dialog')) return;
      if (gameDialogOpen) {
        if (!wasd) return;
        setOpenBoss(null);
        setShowChain(false);
        setRouteOpen(false);
        setHelpOpen(false);
        if (welcomeOpen) guide.start();
        // Resume before this same keydown reaches Phaser's window listener.
        bridge.send("ui:modal", { open: false });
      }
      // Phaser ignores cancelled events, so let the original keydown reach it.
      focusHubCanvas();
    };
    window.addEventListener("keydown", onMove, true);
    return () => window.removeEventListener("keydown", onMove, true);
  }, [arena.wallet.busy, bridge, canvasPhase, gameDialogOpen, guide.start, welcomeOpen, writeState.status]);

  useEffect(() => {
    if (openBoss) guide.panelOpened(openBoss);
  }, [guide.panelOpened, openBoss]);

  useEffect(() => {
    if (openBoss === "cat") arena.selectDefaultEncounter(arena.network);
  }, [arena.network, arena.selectDefaultEncounter, openBoss]);

  useEffect(() => {
    if (isHubEncounter(deployment)) {
      bridge.send("round:state", {
        status: deployment.round.status,
        currentStage: deployment.round.currentStage,
        ...hubStageProgress(deployment.round),
      });
    } else {
      const label = deployment.kind === "loading"
        ? "CHECKING DEPLOYMENT"
        : deployment.kind === "not-deployed"
          ? "NO DEPLOYMENT"
          : "ROUND DATA UNAVAILABLE";
      bridge.send("round:unavailable", { label });
    }
  }, [bridge, deployment]);

  useEffect(() => {
    const live = isHubEncounter(deployment) ? deployment : null;
    const origin = attackOrigin(writeState);
    const originMatchesSelected = Boolean(origin && live && matchesSelectedDeployment(origin, arena.network, arena.selectedChainId, live.manifest));
    const writingAttack = originMatchesSelected && (
      writeState.status === "prompting" || writeState.status === "pending" || writeState.status === "unresolved"
    );
    const confirmedAttack = confirmedBattleAttack(writeState, arena.network, live?.manifest, live?.hookAddress, arena.wallet.account);
    bridge.send("attack:pending", {
      active: Boolean(writingAttack),
      stage: live?.round.currentStage,
    });
    if (confirmedAttack) bridge.send("attack:confirmed", confirmedAttack);
  }, [arena.network, arena.selectedChainId, arena.wallet.account, bridge, deployment, writeState]);

  useEffect(() => {
    if (!showChain) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setShowChain(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [showChain]);

  const overlayWasOpen = useRef(false);
  useEffect(() => {
    if (overlayWasOpen.current && !overlayOpen) focusHubCanvas();
    overlayWasOpen.current = overlayOpen;
  }, [overlayOpen]);

  const closeBoss = useCallback(() => setOpenBoss(null), []);
  const closeRoute = useCallback(() => setRouteOpen(false), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const replayFromHelp = useCallback(() => {
    setHelpOpen(false);
    guide.replay();
  }, [guide.replay]);
  const connectWallet = useCallback(() => {
    void arena.connect().catch(() => undefined);
  }, [arena]);
  const switchWallet = useCallback(() => {
    void arena.switchToSelectedNetwork().catch(() => undefined);
  }, [arena]);
  const hintStep = guide.state.step;
  const showHint =
    guide.hydrated &&
    canvasPhase !== "error" &&
    !overlayOpen &&
    (hintStep === "move" || hintStep === "find" || hintStep === "inspect" || hintStep === "done");
  const guideInspect = showHint && hintStep === "inspect";
  const showBossPrompt = nearBoss !== null && !overlayOpen && !guideInspect;
  const showRoutePrompt = nearRoute && !showBossPrompt && !overlayOpen && !guideInspect;
  const live = isHubEncounter(deployment);
  const chainLabel =
    deployment.kind === "loading" ? "CHECKING" : live ? "LIVE" : deployment.kind === "error" ? "RPC ERROR" : "NOT DEPLOYED";

  return (
    <main ref={shellRef} className="relative h-dvh w-full overflow-hidden bg-ink text-fog">
      <GameCanvas bridge={bridge} onPhase={setCanvasPhase} />
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4">
        <header className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-start">
          <div className="pointer-events-none">
            <p className="font-mono text-[10px] tracking-[0.22em] text-dim">BOSS POOL</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <h1 className="text-sm font-semibold tracking-[0.14em] text-fog">GARDEN HUB</h1>
              <p className="font-mono text-[10px] tracking-[0.16em] text-dim">REGION 01</p>
            </div>
            <span className="mt-1 inline-flex rounded-md border border-[#f5b04a]/40 bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-[#f5b04a]">
              HUB · FIXTURE MAP
            </span>
          </div>
          <div className="pointer-events-auto flex w-full flex-wrap items-start gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              disabled={overlayOpen || canvasPhase === "error"}
              onClick={() => { arena.selectDefaultEncounter(arena.network); setOpenBoss("cat"); }}
              aria-label="Open Pool Unis boss actions"
              className="rounded-lg border border-[#f5b04a]/35 bg-ink/70 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-[#ffd28a] disabled:opacity-40"
            >
              BOSS ACTIONS
            </button>
            <Link
              href="/boostpad?from=game"
              className="rounded-lg border border-[#c48a45]/50 bg-ink/70 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-[#f3e2c4] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]"
            >
              BOOSTPAD
            </Link>
            <label className="rounded-lg border border-white/10 bg-ink/70 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-dim">
              NETWORK
              <select
                aria-label="Deployment network"
                value={arena.network}
                disabled={overlayOpen}
                onChange={(event) => {
                  arena.selectDefaultEncounter(event.target.value as NetworkKey);
                  focusHubCanvas();
                }}
                onBlur={(event) => {
                  const next = event.relatedTarget;
                  if (next instanceof Element && next.closest("header")) return;
                  focusHubCanvas();
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  focusHubCanvas();
                }}
                className="ml-2 bg-transparent text-fog outline-none"
              >
                <option value="local">LOCAL · 31337</option>
                <option value="base-sepolia">BASE SEPOLIA · 84532</option>
              </select>
            </label>
            {arena.wallet.account ? (
              <div className="rounded-lg border border-white/10 bg-ink/70 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-fog">
                {shortAddress(arena.wallet.account)} · {arena.wallet.chainId ?? "?"}
              </div>
            ) : (
              <button
                type="button"
                onClick={connectWallet}
                disabled={overlayOpen || arena.wallet.busy || arena.wallet.status === "checking" || arena.wallet.status === "missing"}
                className="rounded-lg border border-white/10 bg-ink/70 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-fog disabled:opacity-40"
              >
                {arena.wallet.status === "choosing" ? "CHOOSE WALLET…" : arena.wallet.busy ? "CONNECTING…" : arena.wallet.status === "missing" ? "NO WALLET" : "CONNECT WALLET"}
              </button>
            )}
            {arena.networkMismatch && (
              <button
                type="button"
                onClick={switchWallet}
                disabled={overlayOpen || arena.wallet.busy}
                className="rounded-lg border border-danger/40 bg-ink/70 px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-danger disabled:opacity-40"
              >
                SWITCH WALLET TO {arena.selectedChainId}
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowChain((open) => !open)}
              aria-pressed={showChain}
              className={`rounded-lg border bg-ink/70 px-3 py-2 font-mono text-[10px] tracking-[0.14em] ${live ? "border-live/25 text-live-soft" : "border-white/12 text-[#9da8c3]"}`}
            >
              CHAIN · {chainLabel}
            </button>
            <HubSoundControl bridge={bridge} />
          </div>
        </header>

        {arena.wallet.error && (
          <p role="status" className="pointer-events-auto max-w-xl font-mono text-[10px] text-danger">
            {arena.wallet.error}
          </p>
        )}
        {arena.pendingRecord && (
          <div className="pointer-events-auto flex max-w-3xl flex-col gap-2 rounded-lg border border-[#f5b04a]/30 bg-ink/85 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between" role="status">
            <div className="min-w-0">
              <p className="font-mono text-[9px] tracking-[0.1em] text-[#f5b04a]">
                SAVED TRANSACTION · {arena.pendingRecord.request.kind.toUpperCase()} · CHAIN {arena.pendingRecord.request.chainId}
              </p>
              <p className="mt-1 break-all font-mono text-[9px] text-muted">
                {arena.pendingRecord.request.hash} · account {shortAddress(arena.pendingRecord.request.account)}
              </p>
              {writeState.status === "unresolved" && <p className="mt-1 text-xs text-muted">{writeState.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => void arena.resumePending()}
              disabled={writeState.status === "pending" || writeState.status === "prompting"}
              className="shrink-0 rounded-lg border border-[#f5b04a]/30 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-[#ffd28a] disabled:opacity-40"
            >
              RESUME RECEIPT CHECK
            </button>
          </div>
        )}
        {!openBoss && !arena.pendingRecord && writeState.status !== "idle" && (
          <div className="pointer-events-auto">
            <GlobalWriteNotice state={writeState} />
          </div>
        )}

        {canvasPhase !== "error" && (
          <HubGuide
            step={guide.hydrated ? guide.state.step : "hidden"}
            showHint={showHint}
            onStart={guide.start}
            onSkip={guide.skip}
            onDismiss={guide.dismiss}
          />
        )}

        <div className="mt-auto flex flex-col gap-2">
          <div className="flex flex-wrap items-end justify-center gap-2">
            <span className="rounded-md bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.14em] text-dim">WASD / ARROWS · MOVE</span>
            <GatePrompt bossId={nearBoss} hidden={!showBossPrompt} />
            <RoutePrompt hidden={!showRoutePrompt} />
          </div>
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              disabled={overlayOpen || canvasPhase === "error"}
              className="rounded-md border border-white/12 px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-dim transition-opacity duration-150 hover:text-fog disabled:opacity-40 motion-reduce:transition-none"
            >
              HELP
            </button>
            <FullscreenControl target={shellRef} />
            {guide.hydrated && guide.state.step !== "welcome" && <ReplayGuide disabled={overlayOpen} onReplay={guide.replay} />}
          </div>
        </div>
      </div>

      {openBoss && (
        <BossEntryPanel
          boss={findBoss(openBoss)}
          arena={arena}
          onClose={closeBoss}
          suspendInput={writeState.status === "prompting"}
          onConnect={connectWallet}
          onSwitch={switchWallet}
        />
      )}
      {routeOpen && <HubRouteNotice onClose={closeRoute} />}
      {helpOpen && <HubHelp onClose={closeHelp} onReplay={replayFromHelp} />}
      {showChain && (
        <div className="absolute inset-0 z-20 grid place-items-center overflow-y-auto bg-ink/70 p-4 backdrop-blur-[2px]">
          <div className="max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-3xl overflow-y-auto">
            <RoundStatePanel deployment={deployment} />
          </div>
        </div>
      )}
    </main>
  );
}

function focusHubCanvas() {
  const canvas = document.querySelector("main canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.tabIndex = -1;
  canvas.focus({ preventScroll: true });
}

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function GlobalWriteNotice({ state }: { state: ReturnType<typeof useBossPool>["writeState"] }) {
  if (state.status === "idle") return null;
  if (state.status === "confirmed") {
    return (
      <div className="border-l-2 border-live/60 pl-3 text-xs text-live-soft" role="status">
        <p>Confirmed · {state.action} · chain {state.record.request.chainId}</p>
        <p className="mt-1 break-all font-mono text-[9px] text-faint">{state.record.request.hash} · {shortAddress(state.record.request.account)}</p>
      </div>
    );
  }
  if (state.status === "pending" || state.status === "unresolved") return null;
  const message = state.status === "prompting"
    ? `Waiting for the wallet to approve ${state.action}.`
    : `${state.status.toUpperCase()} · ${state.message}`;
  return <p className="text-xs text-muted" role="status">{message}{state.status !== "prompting" && state.hash ? ` · ${state.hash}` : ""}</p>;
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

function isHubEncounter(state: ReturnType<typeof useBossPool>["deployment"]): state is Extract<ReturnType<typeof useBossPool>["deployment"], { kind: "live" }> {
  return state.kind === "live" && state.hookAddress.toLowerCase() === getDefaultBossHook(state.context.baseManifest).toLowerCase();
}

type AttackOrigin = { network: NetworkKey; hookAddress: Address; manifest: DeploymentManifest; target: string };

function attackOrigin(state: ReturnType<typeof useBossPool>["writeState"]): AttackOrigin | null {
  if (state.status === "prompting") {
    if (state.action.toLowerCase() !== "attack") return null;
    return { network: state.network, hookAddress: state.hookAddress, manifest: state.manifest, target: state.manifest.addresses.router };
  }
  if (state.status === "pending" || state.status === "unresolved" || state.status === "confirmed") {
    if (state.record.request.kind !== "attack") return null;
    return {
      network: state.record.network,
      hookAddress: state.record.hookAddress ?? state.record.manifest.addresses.hook,
      manifest: state.record.manifest,
      target: state.record.request.target,
    };
  }
  return null;
}

function matchesSelectedDeployment(
  origin: AttackOrigin,
  network: NetworkKey,
  chainId: number,
  selected: DeploymentManifest,
): boolean {
  return origin.network === network &&
    origin.hookAddress.toLowerCase() === selected.addresses.hook.toLowerCase() &&
    origin.manifest.chainId === chainId &&
    origin.manifest.deploymentTxHash.toLowerCase() === selected.deploymentTxHash.toLowerCase() &&
    origin.manifest.addresses.router.toLowerCase() === selected.addresses.router.toLowerCase() &&
    origin.target.toLowerCase() === selected.addresses.router.toLowerCase();
}
