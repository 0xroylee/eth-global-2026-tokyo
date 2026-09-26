"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type Address, type DecodedContractEvent, type DeploymentManifest } from "@boss-pool/chain";
import { findBoss, type BossId } from "@/game/bosses";
import { GameBridge } from "@/game/bridge";
import { useBossPool, type NetworkKey } from "@/lib/useBossPool";
import { BossEntryPanel } from "./BossEntryPanel";
import { GameCanvas } from "./GameCanvas";
import { RoundStatePanel } from "./RoundStatePanel";
import { HubSoundControl } from "./HubSoundControl";

export function GameShell() {
  const bridge = useMemo(() => new GameBridge(), []);
  const arena = useBossPool();
  const { deployment, writeState } = arena;
  const [nearBoss, setNearBoss] = useState<BossId | null>(null);
  const [openBoss, setOpenBoss] = useState<BossId | null>(null);
  const [showChain, setShowChain] = useState(false);

  useEffect(() => {
    const offNear = bridge.on("gate:near", ({ bossId }) => setNearBoss(bossId));
    const offEnter = bridge.on("gate:enter", ({ bossId }) => setOpenBoss(bossId));
    return () => {
      offNear();
      offEnter();
    };
  }, [bridge]);

  useEffect(() => {
    bridge.send("ui:modal", { open: openBoss !== null || showChain });
  }, [bridge, openBoss, showChain]);

  useEffect(() => {
    if (deployment.kind === "live") {
      bridge.send("round:state", {
        status: deployment.round.status,
        currentStage: deployment.round.currentStage,
        stageSold: deployment.round.stageSold,
        stageCapacity: deployment.round.stageCapacity,
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
    const live = deployment.kind === "live" ? deployment : null;
    const origin = attackOrigin(writeState);
    const originMatchesSelected = Boolean(origin && live && matchesSelectedDeployment(origin, arena.network, arena.selectedChainId, live.manifest));
    const writingAttack = originMatchesSelected && (
      writeState.status === "prompting" || writeState.status === "pending" || writeState.status === "unresolved"
    );
    const confirmedAttack = originMatchesSelected && writeState.status === "confirmed";
    bridge.send("attack:pending", {
      active: Boolean(writingAttack),
      stage: live?.round.currentStage,
    });
    if (confirmedAttack && live) sendConfirmedAttack(bridge, writeState.result, live.manifest.addresses.hook);
  }, [bridge, deployment, arena.network, arena.selectedChainId, writeState]);

  const closeBoss = useCallback(() => setOpenBoss(null), []);

  return (
    <main className="mx-auto flex min-h-screen max-w-[1180px] flex-col px-4 md:px-[38px]">
      <Hud
        arena={arena}
        onToggleChain={() => setShowChain((v) => !v)}
        onOpenCatActions={() => setOpenBoss("cat")}
        chainOpen={showChain}
      />
      {arena.pendingRecord && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-[#f5b04a]/30 bg-panel/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div className="min-w-0">
            <p className="font-mono text-[9px] tracking-[0.1em] text-[#f5b04a]">SAVED TRANSACTION · {arena.pendingRecord.request.kind.toUpperCase()} · CHAIN {arena.pendingRecord.request.chainId}</p>
            <p className="mt-1 break-all font-mono text-[9px] text-muted">{arena.pendingRecord.request.hash} · account {shortAddress(arena.pendingRecord.request.account)}</p>
            {arena.writeState.status === "unresolved" && <p className="mt-1 text-xs text-muted">{arena.writeState.message}</p>}
          </div>
          <button
            type="button"
            onClick={() => void arena.resumePending()}
            disabled={arena.writeState.status === "pending" || arena.writeState.status === "prompting"}
            className="shrink-0 rounded-lg border border-[#f5b04a]/30 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-[#ffd28a] disabled:opacity-40"
          >
            RESUME RECEIPT CHECK
          </button>
        </div>
      )}
      {!openBoss && !arena.pendingRecord && arena.writeState.status !== "idle" && (
        <GlobalWriteNotice state={arena.writeState} />
      )}

      <section className="relative mt-3">
        <GameCanvas bridge={bridge} />

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className="rounded-md border border-[#f5b04a]/40 bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-[#f5b04a]">
            HUB · FIXTURE MAP
          </span>
          <HubSoundControl bridge={bridge} />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
          <span className="rounded-md bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.14em] text-dim">
            WASD / ARROWS · MOVE
          </span>
          <GatePrompt bossId={nearBoss} hidden={openBoss !== null || showChain} />
        </div>

        {openBoss && <BossEntryPanel boss={findBoss(openBoss)} arena={arena} onClose={closeBoss} />}
      </section>

      {showChain && (
        <div className="mt-4">
          <RoundStatePanel deployment={deployment} />
        </div>
      )}

      <footer className="mt-auto flex flex-col justify-between gap-2 py-5 font-mono text-[9px] tracking-[0.12em] text-faint md:flex-row">
        <span>NO MOCK DAMAGE · NO BURN · VERIFIED CONTRACT STATE</span>
        <span>ROUND STATE REFRESHES EVERY 5 SECONDS</span>
      </footer>
    </main>
  );
}

function Hud({
  arena,
  chainOpen,
  onToggleChain,
  onOpenCatActions,
}: {
  arena: ReturnType<typeof useBossPool>;
  chainOpen: boolean;
  onToggleChain: () => void;
  onOpenCatActions: () => void;
}) {
  const deployment = arena.deployment;
  const live = deployment.kind === "live";
  const label =
    deployment.kind === "loading" ? "CHECKING" : live ? "LIVE" : deployment.kind === "error" ? "RPC ERROR" : "NOT DEPLOYED";
  return (
    <header
      className="hairline flex min-h-16 flex-wrap items-center justify-between gap-3 border-b py-3"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <a className="inline-flex items-center gap-[11px] text-xs font-bold tracking-[0.15em] text-fog no-underline" href="/">
        <span className="grid size-[30px] place-items-center rounded-[9px] border border-accent-soft/50 text-[10px] tracking-normal text-accent-soft">
          BP
        </span>
        <span>BOSS POOL</span>
      </a>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onOpenCatActions}
          aria-label="Open Boss actions for Roy the cat"
          className="rounded-full border border-[#f5b04a]/35 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-[#ffd28a] transition-colors hover:bg-[#f5b04a]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f5b04a]"
        >
          BOSS ACTIONS
        </button>
        <label className="sr-only" htmlFor="network-choice">Deployment network</label>
        <select
          id="network-choice"
          value={arena.network}
          onChange={(event) => arena.selectNetwork(event.target.value as NetworkKey)}
          className="rounded-full border border-white/12 bg-panel px-3 py-2 font-mono text-[9px] tracking-[0.08em] text-fog outline-none focus:border-accent/70"
        >
          <option value="local">LOCAL · 31337</option>
          <option value="base-sepolia">BASE SEPOLIA · 84532</option>
          <option value="robinhood-testnet">ROBINHOOD · 46630 · HISTORICAL</option>
        </select>
        {arena.wallet.account ? (
          <div className="flex items-center gap-2 rounded-full border border-white/12 px-2.5 py-1.5">
            <span className="size-[7px] rounded-full bg-live" aria-hidden="true" />
            <span className="font-mono text-[9px] text-fog" title={arena.wallet.account}>{shortAddress(arena.wallet.account)}</span>
            <span className="font-mono text-[8px] text-dim">{arena.wallet.chainId ?? "?"}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void arena.connect().catch(() => undefined)}
            className="rounded-full border border-accent/35 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-accent-soft"
          >
            {arena.wallet.status === "missing" ? "NO WALLET" : "CONNECT WALLET"}
          </button>
        )}
        {arena.networkMismatch && (
          <button
            type="button"
            onClick={() => void arena.switchToSelectedNetwork().catch(() => undefined)}
            className="rounded-full border border-[#f5b04a]/35 px-3 py-2 font-mono text-[9px] tracking-[0.08em] text-[#ffd28a]"
          >
            SWITCH WALLET TO {arena.selectedChainId}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleChain}
          aria-pressed={chainOpen}
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 font-mono text-[9px] tracking-[0.1em] ${live ? "border-live/25 text-live-soft" : "border-white/12 text-[#9da8c3]"}`}
        >
          <span className={`size-[7px] rounded-full ${live ? "bg-live" : "bg-[#8e9bb9]"}`} aria-hidden="true" />
          CHAIN · {label}
          <span aria-hidden="true" className="text-dim">{chainOpen ? "▴" : "▾"}</span>
        </button>
      </div>
      {arena.wallet.error && <p className="w-full text-right text-[10px] text-danger" role="status">{arena.wallet.error}</p>}
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

function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function GlobalWriteNotice({ state }: { state: ReturnType<typeof useBossPool>["writeState"] }) {
  if (state.status === "idle") return null;
  if (state.status === "confirmed") {
    return (
      <div className="mt-3 border-l-2 border-live/60 pl-3 text-xs text-live-soft" role="status">
        <p>Confirmed · {state.action} · chain {state.record.request.chainId}</p>
        <p className="mt-1 break-all font-mono text-[9px] text-faint">{state.record.request.hash} · {shortAddress(state.record.request.account)}</p>
      </div>
    );
  }
  if (state.status === "pending" || state.status === "unresolved") return null;
  const message = state.status === "prompting"
    ? `Waiting for the wallet to approve ${state.action}.`
    : `${state.status.toUpperCase()} · ${state.message}`;
  return <p className="mt-3 text-xs text-muted" role="status">{message}{state.status !== "prompting" && state.hash ? ` · ${state.hash}` : ""}</p>;
}

type AttackOrigin = { network: NetworkKey; manifest: DeploymentManifest; target: string };

function attackOrigin(state: ReturnType<typeof useBossPool>["writeState"]): AttackOrigin | null {
  if (state.status === "prompting") {
    if (state.action.toLowerCase() !== "attack") return null;
    return { network: state.network, manifest: state.manifest, target: state.manifest.addresses.router };
  }
  if (state.status === "pending" || state.status === "unresolved" || state.status === "confirmed") {
    if (state.record.request.kind !== "attack") return null;
    return { network: state.record.network, manifest: state.record.manifest, target: state.record.request.target };
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
    origin.manifest.chainId === chainId &&
    origin.manifest.deploymentTxHash.toLowerCase() === selected.deploymentTxHash.toLowerCase() &&
    origin.manifest.addresses.router.toLowerCase() === selected.addresses.router.toLowerCase() &&
    origin.manifest.addresses.hook.toLowerCase() === selected.addresses.hook.toLowerCase() &&
    origin.target.toLowerCase() === selected.addresses.router.toLowerCase();
}

function sendConfirmedAttack(bridge: GameBridge, value: unknown, expectedHook: string) {
  if (!value || typeof value !== "object" || !("events" in value)) return;
  const events = (value as { events?: readonly DecodedContractEvent[] }).events;
  const event = events?.find((item) => item.eventName === "AttackRecorded" && item.address.toLowerCase() === expectedHook.toLowerCase());
  if (!event || !("stage" in event.args) || !("bossHPOut" in event.args)) return;
  const stage = event.args.stage;
  const bossHPOut = event.args.bossHPOut;
  if (typeof stage !== "number" || typeof bossHPOut !== "bigint") return;
  bridge.send("attack:confirmed", {
    transactionHash: event.transactionHash,
    logIndex: event.logIndex,
    stage,
    bossHPOut,
  });
}
