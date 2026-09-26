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
import { StatusPanel } from "./StatusPanel";
import { VictoryCard } from "./VictoryCard";

const STAGES = [1, 2, 3] as const;
const BUTTON = "window-chrome min-h-[44px] px-3 py-2 font-mono text-[10px] tracking-[0.08em] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4ff] disabled:opacity-60";

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
  const canAttack = round?.status === 1 && secondsLeft > 0 && !busy && arena.network !== "robinhood-testnet";
  const stage = round ? STAGES[round.currentStage] : undefined;
  const visualStage = effect ? STAGES[effect.stage] : stage;
  const openActions = () => actionsDialog.current?.showModal();
  const connectOrSwitch = () => {
    void (account && arena.networkMismatch ? arena.switchToSelectedNetwork() : arena.connect()).catch(() => undefined);
  };

  let title = "ATTACK TOKEN APPEARED!";
  let detail = "Each attack spends up to 1 MockUSD. Review the expected damage first.";
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
    <main className="fixed inset-0 z-30 overflow-y-auto" aria-labelledby="battle-title">
      <div aria-hidden className="fixed inset-0">
        <img src="/images/arena-lake-background.png" alt="" className="size-full object-cover [image-rendering:pixelated]" />
        <div className="absolute inset-0 bg-ink/45" />
      </div>
      <h1 id="battle-title" className="sr-only">Attack Token · Live boss battle</h1>
      <div className={`relative ${defeated ? "min-h-[max(100dvh,740px)]" : "min-h-[max(100dvh,650px)]"}`}>
        <div className="absolute left-[2%] top-4 w-[min(320px,42vw)]">
          <StatusPanel deployment={arena.deployment} now={now} />
        </div>
        <div className="absolute right-[2%] top-4 flex max-w-[48vw] flex-col items-end gap-2">
          <NamePlate stage={stage} />
          <button type="button" onClick={onClose} className={BUTTON}>EXIT BATTLE · ESC</button>
          <label className="sr-only" htmlFor="battle-network">Battle network</label>
          <select id="battle-network" className={`${BUTTON} w-full`} value={arena.network} onChange={(event) => arena.selectNetwork(event.target.value as NetworkKey)}>
            <option value="base-sepolia">Base Sepolia</option>
            <option value="local">Local chain</option>
            <option value="robinhood-testnet">Historical · read only</option>
          </select>
          <button type="button" className={BUTTON} onClick={account && !arena.networkMismatch ? openActions : connectOrSwitch}>
            {!account ? "CONNECT WALLET" : arena.networkMismatch ? "SWITCH NETWORK" : `${account.slice(0, 6)}…${account.slice(-4)}`}
          </button>
          <button type="button" className={BUTTON} onClick={openActions}>{arena.pendingRecord ? "CHECK TRANSACTION" : "BATTLE DETAILS"}</button>
          {arena.deployment.kind !== "live" && <button type="button" className={BUTTON} onClick={arena.refresh}>RETRY</button>}
        </div>

        {visualStage && <div className="absolute bottom-[26%] right-[26%] aspect-square h-[min(34vh,340px)] max-md:right-[10%] max-md:bottom-[30%] max-md:h-[22vh]">
          <BossStage stage={visualStage} state={effect?.defeated || defeated ? "defeated" : effect?.stageCleared ? "transition" : effect ? "hit" : "idle"} />
        </div>}

        {(!defeated || effect) && <div className="absolute inset-x-[2%] bottom-[3%] flex items-end justify-between gap-3 max-md:flex-col max-md:items-start">
          {!defeated && <div className="flex items-end gap-3">
            <CroppedSprite className="h-[min(26vh,190px)] max-md:h-[14vh]" />
            <CommandWindow label={defeated ? "REWARDS" : "ATTACK"} disabled={!defeated && !canAttack} onAction={openActions} onClose={onClose} />
          </div>}
          <DialogWindow title={title} detail={detail} />
        </div>}

        {defeated && round && !effect && <div className="absolute inset-x-4 top-[320px] bottom-6 z-40 flex items-center justify-center">
          <div className="w-[min(420px,90vw)]"><VictoryCard round={round} player={live?.player} onClaim={openActions} onClose={onClose} /></div>
        </div>}
        {effect?.stageCleared && !effect.defeated && <div role="status" className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-ink/70">
          <div className="window-chrome px-6 py-3 font-mono text-[#2b4a8b]">STAGE {effect.stage + 1} CLEARED!</div>
        </div>}
      </div>

      <dialog ref={actionsDialog} aria-labelledby="battle-actions-title" onCancel={(event) => event.stopPropagation()} className="m-auto max-h-[90dvh] w-[min(640px,94vw)] overflow-y-auto border-4 border-[#2b4a8b] bg-panel p-5 text-fog backdrop:bg-ink/75">
        <div className="flex items-start justify-between gap-3">
          <h2 id="battle-actions-title" className="font-mono text-base">{defeated ? "REWARDS" : "ATTACK · 1 MockUSD MAX"}</h2>
          <button type="button" autoFocus className="min-h-[44px] border border-white/30 px-3 text-xs" onClick={() => actionsDialog.current?.close()}>CLOSE</button>
        </div>
        {(!account || arena.networkMismatch) && <button type="button" onClick={connectOrSwitch} className="mt-3 min-h-[44px] border border-white/30 px-3 text-sm">
          {!account ? "Connect wallet" : "Switch wallet network"}
        </button>}
        {arena.wallet.error && <p role="status" className="mt-2 break-words text-sm text-danger">{arena.wallet.error}</p>}
        <BossActions key={identity} arena={arena} />
      </dialog>
    </main>
  );
}
