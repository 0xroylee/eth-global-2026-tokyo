"use client";

/* eslint-disable @next/next/no-img-element -- static pixel artwork */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmedBattleAttack, roundSecondsLeft, type ConfirmedBattleAttack } from "@/lib/battle";
import { displayAmount } from "@/lib/format";
import type { useBossPool, NetworkKey } from "@/lib/useBossPool";
import { useArena } from "../BossPoolProvider";
import { BossActions } from "../BossActions";
import { BossStage } from "./BossStage";
import { CommandWindow } from "./CommandWindow";
import { CroppedSprite } from "./CroppedSprite";
import { DialogWindow } from "./DialogWindow";
import { NamePlate } from "./NamePlate";
import { BattleMeta, StatusPanel } from "./StatusPanel";
import { VictoryCard } from "./VictoryCard";

const STAGES = [1, 2, 3] as const;
const BUTTON = "min-h-11 border-2 border-[#FFF9E9] bg-[#092B61] px-3 py-2 font-pixel text-[10px] leading-relaxed text-white shadow-[3px_3px_0_#041833] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4ff] disabled:opacity-60";

export function BattlePage({ initialNetwork }: { initialNetwork: NetworkKey }) {
  const arena = useArena();
  const [networkReady, setNetworkReady] = useState(false);
  const router = useRouter();
  const selectNetwork = arena.selectNetwork;
  useEffect(() => {
    selectNetwork(initialNetwork);
    setNetworkReady(true);
  }, [initialNetwork, selectNetwork]);
  if (!networkReady) return <p role="status" className="p-6">Loading battle…</p>;
  return <BattleView arena={arena} onClose={() => router.push("/")} />;
}

export function BattleView({ arena, onClose }: { arena: ReturnType<typeof useBossPool>; onClose: () => void }) {
  const [now, setNow] = useState(Date.now);
  const [effect, setEffect] = useState<ConfirmedBattleAttack | null>(null);
  const seenEffects = useRef(new Set<string>());
  const actionsDialog = useRef<HTMLDialogElement>(null);
  const live = arena.deployment.kind === "live" ? arena.deployment : null;
  const round = live?.round;
  const manifest = live?.manifest;
  const account = arena.wallet.account;
  const identity = `${arena.network}:${manifest?.deploymentTxHash ?? "unavailable"}:${account ?? "public"}`;
  const hit = useMemo(
    () => confirmedBattleAttack(arena.writeState, arena.network, manifest, account),
    [arena.writeState, arena.network, manifest, account],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || actionsDialog.current?.open) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setEffect(null);
    if (!hit || seenEffects.current.has(hit.id)) return;
    seenEffects.current.add(hit.id);
    setEffect(hit);
    actionsDialog.current?.close();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setEffect(null), reduced ? 100 : 1_400);
    return () => window.clearTimeout(timer);
  }, [hit, identity]);

  const secondsLeft = live ? roundSecondsLeft(live.round, live.readAt, now) : 0;
  const defeated = round?.status === 3;
  const expired = Boolean(round && !defeated && (round.status === 4 || secondsLeft === 0));
  const busy = arena.writeState.status === "prompting" || arena.writeState.status === "pending" || arena.writeState.status === "unresolved" || Boolean(arena.pendingRecord);
  const canAttack = round?.status === 1 && secondsLeft > 0 && !busy;
  const stage = round ? STAGES[round.currentStage] : undefined;
  const visualStage = effect ? STAGES[effect.stage] : stage;
  const openActions = () => actionsDialog.current?.showModal();
  const connectOrSwitch = () => {
    void (account && arena.networkMismatch ? arena.switchToSelectedNetwork() : arena.connect()).catch(() => undefined);
  };

  const action = effect ? "HIT CONFIRMED" : busy ? arena.writeState.status === "prompting" ? "PREPARING" : "PENDING" : defeated ? "DEFEATED" : expired ? "ROUND ENDED" : canAttack ? "SWAP ATTACK" : "WAITING";
  let title = "Guardian of the Liquidity Spring!";
  let detail = "Pool Unis appeared. Each swap attack spends up to 1 MockUSD; review the expected damage first.";
  if (!round) {
    title = arena.deployment.kind === "loading" ? "CHECKING THE ROUND…" : "ROUND UNAVAILABLE";
    detail = arena.deployment.kind === "error" ? "Round data is unavailable. Open battle details or retry." : arena.deployment.kind === "not-deployed" ? "No deployment was found for this network." : "Reading the selected deployment.";
  } else if (effect) {
    title = effect.defeated ? "BOSS DEFEATED!" : effect.stageCleared ? `STAGE ${effect.stage + 1} CLEARED!` : `HIT CONFIRMED · ${displayAmount(effect.bossHPOut, 18)} HP`;
    detail = `${displayAmount(effect.bossHPOut, 18)} damage confirmed in Stage ${effect.stage + 1}.`;
  } else if (busy) {
    title = arena.writeState.status === "prompting" ? "PREPARING WALLET ACTION…" : "TRANSACTION PENDING";
    detail = "Open transaction details to follow the receipt. Leaving does not cancel a submitted transaction.";
  } else if (defeated) {
    title = "BOSS DEFEATED!";
    detail = "Current BossHP holders can redeem their prize share.";
  } else if (expired) {
    title = "ROUND ENDED";
    detail = "Attacks are closed. Previous attack purchases are nonrefundable.";
  } else if (round.status !== 1) {
    title = "BATTLE NOT ACTIVE";
    detail = "Waiting for the round to become active on chain.";
  } else if (arena.writeState.status !== "idle" && arena.writeState.status !== "confirmed") {
    title = arena.writeState.status.toUpperCase();
    detail = "message" in arena.writeState ? arena.writeState.message : "Open transaction details to continue.";
  }

  return (
    <main className="fixed inset-0 z-30 overflow-y-auto font-pixel [-webkit-font-smoothing:none]" aria-labelledby="battle-title">
      <div aria-hidden className="fixed inset-0">
        <img src="/images/arena-lake-background.png" alt="" className="size-full object-cover [image-rendering:pixelated]" />
      </div>
      <h1 id="battle-title" className="sr-only">Pool Unis · Live boss battle</h1>
      <div className="relative mx-auto grid min-h-dvh max-w-[1800px] grid-cols-1 gap-4 p-3 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:grid-rows-[auto_auto_minmax(180px,1fr)_auto] md:p-5">
        <div role="group" aria-label="Battle controls" className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
          <label className="sr-only" htmlFor="battle-network">Battle network</label>
          <select id="battle-network" className={`${BUTTON} max-w-full`} value={arena.network} onChange={(event) => arena.selectNetwork(event.target.value as NetworkKey)}>
            <option value="base-sepolia">Base Sepolia</option>
            <option value="local">Local chain</option>
            <option value="robinhood-testnet">Historical · read only</option>
          </select>
          <button
            type="button"
            className={BUTTON}
            onClick={account && !arena.networkMismatch ? openActions : connectOrSwitch}
            disabled={arena.wallet.busy || arena.wallet.status === "checking" || arena.wallet.status === "missing"}
          >
            {!account ? "CONNECT WALLET" : arena.networkMismatch ? "SWITCH NETWORK" : `${account.slice(0, 6)}…${account.slice(-4)}`}
          </button>
          <button type="button" className={BUTTON} onClick={openActions}>{arena.pendingRecord ? "CHECK TRANSACTION" : "BATTLE DETAILS"}</button>
          <button type="button" onClick={onClose} className={BUTTON}>ESC · EXIT</button>
        </div>
        <div className="min-w-0 md:col-start-1 md:row-start-2 lg:absolute lg:left-6 lg:top-7 lg:z-20 lg:w-[44vw]"><StatusPanel deployment={arena.deployment} /></div>
        <div className="w-full min-w-0 max-w-[480px] justify-self-end md:col-start-2 md:row-start-2 lg:absolute lg:right-4 lg:top-16 lg:z-20 lg:w-auto lg:max-w-none"><NamePlate stage={stage} action={action} /></div>
        <div className="grid min-w-0 grid-cols-[minmax(100px,0.85fr)_minmax(0,1.15fr)] items-end gap-3 md:contents">
          <div className="flex min-w-0 flex-col items-start gap-3 self-end md:col-start-1 md:row-start-3 lg:absolute lg:bottom-[calc(min(40vh,360px)+48px)] lg:left-6 lg:z-20 lg:gap-2">
            <BattleMeta deployment={arena.deployment} now={now} />
            <div className="w-[108px] rounded-lg border-[3px] border-[#f3ead2] bg-[#16356e] p-1.5 shadow-[3px_3px_0_#041833]">
              <div className="mx-auto h-[84px] w-[70px] overflow-hidden"><CroppedSprite className="h-[140px]" /></div>
              <p className="mt-1 text-center text-base leading-none text-[#f6e7b2]">YOU</p>
            </div>
          </div>
          <div className="relative h-[260px] min-w-0 self-end sm:h-[300px] md:col-start-2 md:row-start-3 md:h-[clamp(180px,30vh,360px)] lg:pointer-events-none lg:absolute lg:left-1/2 lg:top-[max(20%,194px)] lg:z-[18] lg:h-[min(50vh,calc(80vh-272px))] lg:w-[35%]">
            {visualStage && <BossStage stage={visualStage} state={effect?.defeated || defeated ? "defeated" : effect?.stageCleared ? "transition" : effect ? "hit" : "idle"} />}
          </div>
        </div>
        {!defeated && <div className="min-w-0 self-end md:col-start-1 md:row-start-4 lg:absolute lg:bottom-8 lg:left-6 lg:z-20 lg:h-[min(40vh,360px)] lg:w-[36vw]"><CommandWindow label="SWAP ATTACK" disabled={!canAttack} onAction={openActions} onClose={onClose} /></div>}
        {(!defeated || effect) && <div className={`min-w-0 self-end md:row-start-4 lg:absolute lg:bottom-8 lg:left-[54%] lg:right-4 lg:z-20 lg:h-[200px] ${defeated ? "md:col-span-2" : "md:col-start-2"}`}><DialogWindow title={title} detail={detail} /></div>}
        {defeated && round && !effect && <div className="mx-auto w-full md:col-span-2 md:row-start-4 lg:absolute lg:inset-0 lg:z-40 lg:grid lg:place-items-center lg:bg-[#041833]/80 lg:p-4">
          <div className="mx-auto w-full max-w-[480px]"><VictoryCard round={round} player={live?.player} onClaim={openActions} onClose={onClose} /></div>
        </div>}
        {effect?.stageCleared && !effect.defeated && <div role="status" className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-ink/70">
          <div className="window-chrome px-6 py-3 font-mono text-[#2b4a8b]">STAGE {effect.stage + 1} CLEARED!</div>
        </div>}
      </div>

      <dialog ref={actionsDialog} aria-labelledby="battle-actions-title" onCancel={(event) => event.stopPropagation()} className="m-auto max-h-[90dvh] w-[min(640px,94vw)] overflow-y-auto border-4 border-[#2b4a8b] bg-panel p-5 text-fog backdrop:bg-ink/75">
        <div className="flex items-start justify-between gap-3">
          <h2 id="battle-actions-title" className="font-pixel text-sm">{defeated ? "REWARDS" : "SWAP ATTACK · 1 MockUSD MAX"}</h2>
          <button type="button" autoFocus className="min-h-[44px] border border-white/30 px-3 text-xs" onClick={() => actionsDialog.current?.close()}>CLOSE</button>
        </div>
        {(!account || arena.networkMismatch) && <button
          type="button"
          onClick={connectOrSwitch}
          disabled={arena.wallet.busy || arena.wallet.status === "checking" || arena.wallet.status === "missing"}
          className="mt-3 min-h-[44px] border border-white/30 px-3 text-sm disabled:opacity-50"
        >
          {!account ? "Connect wallet" : "Switch wallet network"}
        </button>}
        {arena.wallet.error && <p role="status" className="mt-2 break-words text-sm text-danger">{arena.wallet.error}</p>}
        <BossActions key={identity} arena={arena} />
      </dialog>
    </main>
  );
}
