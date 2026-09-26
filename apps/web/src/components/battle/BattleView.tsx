"use client";

/* eslint-disable @next/next/no-img-element -- static pixel artwork */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { attackPlaybackChoice, attackWaitPhase, confirmedBattleAttack, roundSecondsLeft, writeStateMatchesEncounter, type ConfirmedBattleAttack, type SeenAttackMemory } from "@/lib/battle";
import { attackCapAmount, type AttackCap } from "@/lib/attackCommand";
import { displayAmount } from "@/lib/format";
import { findBossPresentation, POOL_UNIS_PRESENTATION } from "@/game/bosses";
import type { useBossPool, NetworkKey } from "@/lib/useBossPool";
import { useArena } from "../BossPoolProvider";
import { BossActions, type AttackQuotePreview, type BossActionsHandle } from "../BossActions";
import { AttackEffects, type AttackEffectPhase } from "./AttackEffects";
import { BossStage } from "./BossStage";
import { BattleActivityLog } from "./BattleActivityLog";
import { CommandWindow } from "./CommandWindow";
import { CroppedSprite } from "./CroppedSprite";
import { DialogWindow } from "./DialogWindow";
import { NamePlate } from "./NamePlate";
import { StatusPanel } from "./StatusPanel";
import { useBattleSound } from "./useBattleSound";
import { VictoryCard } from "./VictoryCard";

type AttackSequence = { hit: ConfirmedBattleAttack; phase: AttackEffectPhase; animate: boolean };

function browserSeenStorage() {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

const STAGES = [1, 2, 3] as const;
const BUTTON = "min-h-11 border-2 border-[#FFF9E9] bg-[#092B61] px-3 py-2 font-pixel text-[10px] leading-relaxed text-white shadow-[3px_3px_0_#041833] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4ff] disabled:opacity-60";
const EMPTY_ATTACK_PREVIEW: AttackQuotePreview = {
  quote: null,
  quotes: {},
  errors: {},
  fresh: false,
  loading: false,
  error: null,
  allowanceLoading: false,
  allowanceMissing: false,
  hasInputBalance: false,
  ready: false,
  playerReady: false,
  allowanceReady: false,
  outputSymbol: "HP",
  outputDecimals: 18,
};

export function BattlePage({ initialNetwork, hookAddress }: { initialNetwork: NetworkKey; hookAddress?: string }) {
  const arena = useArena();
  const router = useRouter();
  useEffect(() => {
    if (hookAddress !== undefined) arena.selectEncounter(initialNetwork, hookAddress);
    else arena.selectDefaultEncounter(initialNetwork);
  }, [arena.selectDefaultEncounter, arena.selectEncounter, hookAddress, initialNetwork]);
  const selectionReady = arena.network === initialNetwork &&
    (hookAddress === undefined ? arena.requestedHookAddress === undefined : arena.requestedHookAddress === hookAddress);

  useEffect(() => {
    if (!selectionReady || hookAddress !== undefined || !arena.selectedHookAddress) return;
    router.replace(`/battle/${arena.selectedHookAddress}?network=${initialNetwork}`);
  }, [arena.selectedHookAddress, hookAddress, initialNetwork, router, selectionReady]);

  if (!selectionReady) return <p role="status" className="p-6">Loading selected boss…</p>;
  return <BattleView arena={arena} routeHookAddress={hookAddress} onClose={() => router.push("/")} />;
}

export function BattleView({ arena, routeHookAddress, onClose }: { arena: ReturnType<typeof useBossPool>; routeHookAddress?: string; onClose: () => void }) {
  const [now, setNow] = useState(Date.now);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [sequence, setSequence] = useState<AttackSequence | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [anchors, setAnchors] = useState<{ origin: { x: number; y: number }; target: { x: number; y: number } } | null>(null);
  const [attackPreview, setAttackPreview] = useState(EMPTY_ATTACK_PREVIEW);
  const [approvalOnly, setApprovalOnly] = useState(false);
  const [restoreAttackFocus, setRestoreAttackFocus] = useState(false);
  const router = useRouter();
  const seenMemory = useRef<SeenAttackMemory>({ ids: [] });
  const fieldRef = useRef<HTMLDivElement>(null);
  const controlsButtonRef = useRef<HTMLButtonElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const bossRef = useRef<HTMLDivElement>(null);
  const actionsDialog = useRef<HTMLDialogElement>(null);
  const bossActions = useRef<BossActionsHandle>(null);
  const attackButtonRef = useRef<HTMLButtonElement>(null);
  const closeControls = useCallback(() => {
    setControlsOpen(false);
    controlsButtonRef.current?.focus();
  }, []);
  const live = arena.deployment.kind === "live" ? arena.deployment : null;
  const round = live?.round;
  const hpDecimals = round?.hpToken.decimals ?? 18;
  const hpSymbol = round?.hpToken.symbol ?? "HP";
  const manifest = live?.manifest;
  const account = arena.wallet.account;
  const hookAddress = routeHookAddress ?? arena.selectedHookAddress;
  const writeMatches = writeStateMatchesEncounter(arena.writeState, arena.network, hookAddress);
  const visibleEffect = sequence && sequence.hit.hookAddress.toLowerCase() === hookAddress?.toLowerCase() ? sequence.hit : null;
  const attackWait = attackWaitPhase(arena.writeState, arena.network, hookAddress);
  const presentation = hookAddress
    ? findBossPresentation(arena.selectedChainId, hookAddress, arena.network === "local" && live ? live.context.baseManifest.addresses.hook : undefined)
      ?? (round?.encounterMode === "factory" && round.deadline === 0n ? POOL_UNIS_PRESENTATION : undefined)
    : undefined;
  const identity = `${arena.network}:${hookAddress?.toLowerCase() ?? "unavailable"}:${manifest?.deploymentTxHash ?? "unavailable"}:${account ?? "public"}`;
  const [attackSelection, setAttackSelection] = useState<{ identity: string; cap: AttackCap } | null>(null);
  const selectedCap = attackSelection?.identity === identity ? attackSelection.cap : 1;
  const sound = useBattleSound(identity);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const hit = useMemo(
    () => confirmedBattleAttack(arena.writeState, arena.network, manifest, hookAddress, account),
    [arena.writeState, arena.network, manifest, hookAddress, account],
  );
  const updateAttackPreview = useCallback((preview: AttackQuotePreview) => setAttackPreview(preview), []);
  const closeActions = useCallback(() => {
    setApprovalOnly(false);
    setRestoreAttackFocus(false);
    actionsDialog.current?.close();
  }, []);
  const returnToAttack = useCallback(() => {
    setApprovalOnly(false);
    setRestoreAttackFocus(true);
    actionsDialog.current?.close();
  }, []);
  const openApproval = useCallback(() => {
    setApprovalOnly(true);
    actionsDialog.current?.showModal();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || actionsDialog.current?.open || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      if (controlsOpen) {
        closeControls();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeControls, controlsOpen, onClose]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReducedMotion(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!hit) {
      setSequence(null);
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    const frame = window.requestAnimationFrame(() => {
      const choice = attackPlaybackChoice({
        id: hit.id,
        hidden: document.hidden,
        cancelled,
        memory: seenMemory.current,
        storage: browserSeenStorage(),
      });
      if (choice === "cancelled") return;
      const reducedNow = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const show = (phase: AttackEffectPhase, animate: boolean) => {
        if (!cancelled) setSequence({ hit, phase, animate: animate && !reducedNow() });
      };
      setApprovalOnly(false);
      setRestoreAttackFocus(false);
      actionsDialog.current?.close();
      if (choice === "static") {
        show("result", false);
        timers.push(window.setTimeout(() => { if (!cancelled) setSequence(null); }, 1_200));
        return;
      }
      show("projectile", true);
      if (!reducedNow()) soundRef.current.play("launch");
      timers.push(window.setTimeout(() => {
        show("impact", true);
        soundRef.current.play("impact");
      }, 240));
      timers.push(window.setTimeout(() => {
        const phase: AttackEffectPhase = hit.defeated ? "victory" : hit.stageCleared ? "stage-clear" : "impact";
        show(phase, true);
        if (hit.defeated) soundRef.current.play("victory");
        else if (hit.stageCleared) soundRef.current.play("stage-clear");
      }, 750));
      if (!hit.stageCleared && !hit.defeated) {
        timers.push(window.setTimeout(() => { if (!cancelled) setSequence(null); }, 1_200));
      }
      if (hit.stageCleared && !hit.defeated) {
        timers.push(window.setTimeout(() => show("result", false), 1_500));
        timers.push(window.setTimeout(() => { if (!cancelled) setSequence(null); }, 2_700));
      }
      if (hit.defeated) {
        timers.push(window.setTimeout(() => { if (!cancelled) setSequence(null); }, 1_800));
      }
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      for (const timer of timers) window.clearTimeout(timer);
      soundRef.current.stop();
    };
  }, [hit, identity]);

  const previousWait = useRef(attackWait);
  useEffect(() => {
    if (previousWait.current !== "charging" && attackWait === "charging") soundRef.current.play("charge");
    if (previousWait.current !== "pending" && attackWait === "pending") soundRef.current.play("submit");
    previousWait.current = attackWait;
  }, [attackWait]);

  useEffect(() => {
    const onHide = () => {
      if (!document.hidden) return;
      soundRef.current.stop();
      setSequence((current) => current && current.animate ? { ...current, phase: "result", animate: false } : current);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const previousIdentity = useRef(identity);
  useEffect(() => {
    if (previousIdentity.current === identity) return;
    previousIdentity.current = identity;
    setAttackSelection({ identity, cap: 1 });
    if (approvalOnly) closeActions();
  }, [identity, approvalOnly, closeActions]);

  const secondsLeft = live ? roundSecondsLeft(live.round, live.readAt, now) : 0;
  const defeated = round?.status === 3;
  const expired = Boolean(round && !defeated && (round.status === 4 || secondsLeft === 0));
  const busy = arena.writeState.status === "prompting" || arena.writeState.status === "pending" || arena.writeState.status === "unresolved" || Boolean(arena.pendingRecord);
  const canAttack = round?.status === 1 && (secondsLeft === null || secondsLeft > 0) && !busy;
  const stage = round ? STAGES[round.currentStage] : undefined;
  const holdOldForm = Boolean(sequence?.animate && sequence.phase !== "result" && visibleEffect);
  const visualStage = holdOldForm && visibleEffect ? STAGES[visibleEffect.stage] : stage;
  const bossState = sequence?.animate && sequence.phase === "impact" ? "hit"
    : sequence?.animate && sequence.phase === "stage-clear" ? "transition"
      : sequence?.animate && sequence.phase === "victory" ? "defeated"
        : defeated ? "defeated" : "idle";
  const openActions = () => {
    setApprovalOnly(false);
    actionsDialog.current?.showModal();
  };
  const connectOrSwitch = () => {
    void (account && arena.networkMismatch ? arena.switchToSelectedNetwork() : arena.connect()).catch(() => undefined);
  };
  const attackFromCommand = (cap: AttackCap) => {
    setAttackSelection({ identity, cap });
    if (busy || arena.wallet.busy) return;
    if (!account || arena.networkMismatch) connectOrSwitch();
    else bossActions.current?.attackOrRequestApproval(cap);
  };
  const changeNetwork = (nextNetwork: NetworkKey) => {
    if (hookAddress) {
      arena.selectEncounter(nextNetwork, hookAddress);
      router.replace(`/battle/${hookAddress}?network=${nextNetwork}`);
    } else {
      arena.selectDefaultEncounter(nextNetwork);
      router.replace(`/battle?network=${nextNetwork}`);
    }
  };

  const action = visibleEffect ? "HIT CONFIRMED" : busy ? writeMatches ? arena.writeState.status === "prompting" ? "PREPARING" : "PENDING" : "OTHER TRANSACTION" : defeated ? "DEFEATED" : expired ? "ROUND ENDED" : canAttack ? "SWAP ATTACK" : "WAITING";
  const commandChecking = Boolean(account && live && (!attackPreview.playerReady || (!attackPreview.allowanceReady && attackPreview.allowanceLoading)));
  const allowanceUnavailable = Boolean(account && live && attackPreview.playerReady && !attackPreview.allowanceReady && !attackPreview.allowanceLoading);
  const capMatchesPreview = attackPreview.quote?.maxMockUSD === attackCapAmount(selectedCap);
  const commandWaitingForQuote = Boolean(account && !arena.networkMismatch && round?.status === 1 &&
    (!capMatchesPreview || !attackPreview.fresh));
  const commandStatus = !account
    ? arena.wallet.status === "checking" ? "CHECKING WALLET" : arena.wallet.status === "missing" ? "WALLET UNAVAILABLE" : "CONNECT WALLET"
    : arena.networkMismatch ? "SWITCH NETWORK"
      : busy ? "WAIT FOR RECEIPT"
        : commandChecking ? "CHECKING WALLET"
          : allowanceUnavailable ? "ALLOWANCE UNAVAILABLE"
          : commandWaitingForQuote ? "LOADING QUOTE…"
            : !attackPreview.hasInputBalance ? `NEED ${selectedCap} MockUSD`
              : attackPreview.allowanceMissing ? "APPROVAL NEEDED" : "READY";
  const commandDisabled = !canAttack;

  useEffect(() => {
    if (!restoreAttackFocus) return;
    if (commandDisabled) {
      const timer = window.setTimeout(() => setRestoreAttackFocus(false), 5_000);
      return () => window.clearTimeout(timer);
    }
    const frame = window.requestAnimationFrame(() => {
      attackButtonRef.current?.focus();
      setRestoreAttackFocus(false);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [restoreAttackFocus, commandDisabled]);

  useLayoutEffect(() => {
    const measure = () => {
      const field = fieldRef.current;
      const player = playerRef.current;
      const boss = bossRef.current;
      if (!field || !player || !boss) {
        setAnchors(null);
        return;
      }
      const root = field.getBoundingClientRect();
      const from = player.getBoundingClientRect();
      const to = boss.getBoundingClientRect();
      setAnchors({
        origin: { x: from.left - root.left + from.width / 2, y: from.top - root.top + from.height / 2 },
        target: { x: to.left - root.left + to.width / 2, y: to.top - root.top + to.height * 0.42 },
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [presentation?.name, sequence?.phase, visualStage]);

  const factoryRound = round?.encounterMode === "factory";
  const claimReady = Boolean(live?.player && round && round.finalEligibleHP > 0n && (factoryRound ? live.player.rewardCredit : live.player.bossHPBalance) > 0n);
  const effectLabel = visibleEffect ? `+${displayAmount(visibleEffect.bossHPOut, hpDecimals)} ${hpSymbol}` : "";
  let title = presentation ? `${presentation.name} appeared.` : "BOSS APPEARANCE NOT CONFIGURED";
  let detail = presentation
    ? "Choose an attack. Live quotes estimate the tokens you receive at current pool prices."
    : "This verified Hook has no configured stage artwork. Its on-chain encounter remains available.";
  if (!round) {
    title = arena.deployment.kind === "loading" ? "CHECKING THE ROUND…" : "ROUND UNAVAILABLE";
    detail = arena.deployment.kind === "error" ? "Round data is unavailable. Open battle details or retry." : arena.deployment.kind === "not-deployed" ? "No deployment was found for this network." : "Reading the selected deployment.";
  } else if (visibleEffect) {
    const amount = displayAmount(visibleEffect.bossHPOut, hpDecimals);
    title = visibleEffect.defeated
      ? claimReady ? "Victory — prize claim available" : "BOSS DEFEATED!"
      : visibleEffect.stageCleared ? `STAGE ${visibleEffect.stage + 1} CLEARED!`
        : factoryRound ? `+${amount} ${hpSymbol} received` : `HIT CONFIRMED · ${amount} ${hpSymbol}`;
    detail = factoryRound
      ? `+${amount} ${hpSymbol} received. Raid progress ${displayAmount(round.stageVolume[visibleEffect.stage] ?? 0n, 6)} MockUSD.`
      : `${amount} ${hpSymbol} damage in Stage ${visibleEffect.stage + 1}.`;
  } else if (attackWait === "charging") {
    title = "CONFIRM THE ATTACK";
    detail = "Waiting for the wallet signature. No damage is dealt yet.";
  } else if (attackWait === "pending") {
    title = "Attack pending…";
    detail = "The attack is submitted. Damage appears after the receipt is confirmed.";
  } else if (attackWait === "checking") {
    title = "Checking transaction…";
    detail = "The saved attack hash is still waiting for its receipt.";
  } else if (busy) {
    title = !writeMatches ? "ANOTHER BOSS TRANSACTION IS ACTIVE" : arena.writeState.status === "prompting" ? "PREPARING WALLET ACTION…" : "TRANSACTION PENDING";
    detail = !writeMatches ? "Resolve the saved transaction before starting an action in this encounter." : "Open transaction details to follow the receipt. Leaving does not cancel a submitted transaction.";
  } else if (defeated) {
    title = claimReady ? "Victory — prize claim available" : "BOSS DEFEATED!";
    detail = claimReady ? "Claim is available from rewards. The prize is not paid until that claim succeeds." : "This encounter is defeated.";
  } else if (expired) {
    title = "ROUND ENDED";
    detail = "Attacks are closed. Previous attack purchases are nonrefundable.";
  } else if (round.status !== 1) {
    title = "BATTLE NOT ACTIVE";
    detail = "Waiting for the round to become active on chain.";
  } else if (writeMatches && arena.writeState.status !== "idle" && arena.writeState.status !== "confirmed") {
    title = arena.writeState.status.toUpperCase();
    detail = "message" in arena.writeState ? arena.writeState.message : "Open transaction details to continue.";
  }

  return (
    <main className="fixed inset-0 z-30 h-dvh max-h-dvh overflow-hidden font-pixel [-webkit-font-smoothing:none]" aria-labelledby="battle-title">
      <div aria-hidden className="fixed inset-0">
        <img src="/images/arena-lake-background.png" alt="" className="size-full object-cover [image-rendering:pixelated]" />
      </div>
      <h1 id="battle-title" className="sr-only">{presentation?.name ?? "Boss appearance not configured"} · Live boss battle</h1>
      <div ref={fieldRef} className="relative mx-auto grid h-full max-h-full min-h-0 max-w-[1800px] grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4 p-3 md:p-5">
        <div role="group" aria-label="Battle controls" className="relative z-40 col-span-2 flex items-center justify-end">
          <button
            type="button"
            ref={controlsButtonRef}
            className={`${BUTTON} grid w-11 place-items-center p-2`}
            aria-label={controlsOpen ? "Close battle menu" : "Open battle menu"}
            aria-expanded={controlsOpen}
            aria-controls="battle-controls-menu"
            onClick={() => setControlsOpen((open) => !open)}
          >
            <span aria-hidden className="grid gap-1">
              <span className="h-0.5 w-5 bg-current" />
              <span className="h-0.5 w-5 bg-current" />
              <span className="h-0.5 w-5 bg-current" />
            </span>
          </button>
          <div id="battle-controls-menu" className={`${controlsOpen ? "grid" : "hidden"} absolute right-0 top-full mt-2 max-h-[calc(100dvh-5rem)] w-[min(16rem,calc(100vw-1.5rem))] gap-2 overflow-y-auto border-2 border-[#FFF9E9] bg-[#092B61] p-2 shadow-[3px_3px_0_#041833]`}>
            <label className="sr-only" htmlFor="battle-network">Battle network</label>
            <select id="battle-network" className={`${BUTTON} w-full`} value={arena.network} onChange={(event) => { closeControls(); changeNetwork(event.target.value as NetworkKey); }}>
              <option value="base-sepolia">Base Sepolia</option>
              <option value="local">Local chain</option>
            </select>
            <button
              type="button"
              className={`${BUTTON} w-full text-left`}
              onClick={() => { closeControls(); if (account && !arena.networkMismatch) openActions(); else connectOrSwitch(); }}
              disabled={arena.wallet.busy || arena.wallet.status === "checking" || arena.wallet.status === "missing"}
            >
              {!account ? "CONNECT WALLET" : arena.networkMismatch ? "SWITCH NETWORK" : `${account.slice(0, 6)}…${account.slice(-4)}`}
            </button>
            <button type="button" className={`${BUTTON} w-full text-left`} onClick={() => { closeControls(); openActions(); }}>{arena.pendingRecord ? "CHECK TRANSACTION" : "BATTLE DETAILS"}</button>
            <button type="button" className={`${BUTTON} w-full text-left`} aria-pressed={sound.on} aria-label={sound.failed ? "Battle sound unavailable. Retry" : "Battle sound"} onClick={() => { closeControls(); void sound.toggle(); }}>
              {sound.failed ? "SOUND · RETRY" : `SOUND · ${sound.on ? "ON" : "OFF"}`}
            </button>
            <button type="button" onClick={() => { closeControls(); onClose(); }} className={`${BUTTON} w-full text-left`}>ESC · EXIT</button>
          </div>
        </div>
        <div className="col-start-1 row-start-2 min-w-0 lg:absolute lg:col-auto lg:row-auto lg:left-6 lg:top-7 lg:z-20 lg:w-[44vw]"><StatusPanel deployment={arena.deployment} /></div>
        <div className="col-start-2 row-start-2 w-full min-w-0 max-w-[480px] justify-self-end lg:absolute lg:col-auto lg:row-auto lg:right-4 lg:top-16 lg:z-20 lg:w-auto lg:max-w-none"><NamePlate stage={stage} action={action} presentation={presentation} /></div>
        <div className="col-span-2 row-start-3 grid min-h-0 min-w-0 grid-cols-[minmax(100px,0.85fr)_minmax(0,1.15fr)] items-end gap-3 md:contents">
          <div className="col-start-1 flex min-w-0 flex-col items-start gap-3 self-end md:row-start-3 lg:absolute lg:col-auto lg:row-auto lg:bottom-[calc(min(40vh,360px)+48px)] lg:left-6 lg:z-20 lg:gap-2">
            <div ref={playerRef} className={`relative w-[108px] rounded-lg border-[3px] border-[#f3ead2] bg-[#16356e] p-1.5 shadow-[3px_3px_0_#041833] ${attackWait === "charging" && !reducedMotion ? "player-charging" : ""}`}>
              {attackWait === "charging" && !reducedMotion && <span aria-hidden className="player-spark absolute -right-1 top-2 size-2 bg-[#f6e7b2] shadow-[1px_1px_0_#041833]" />}
              <div className="mx-auto h-[84px] w-[70px] overflow-hidden"><CroppedSprite className="h-[140px]" /></div>
              <p className="mt-1 text-center text-base leading-none text-[#f6e7b2]">YOU</p>
            </div>
          </div>
          <div ref={bossRef} className="relative col-start-2 h-full min-h-0 min-w-0 self-end md:pointer-events-none md:absolute md:col-auto md:row-auto md:left-1/2 md:top-[230px] md:z-[18] md:h-[min(360px,calc(100dvh-300px))] md:w-[35%]">
            {!presentation
              ? <div className="grid h-full place-items-center p-4"><p className="window-chrome max-w-sm px-5 py-4 text-center font-pixel text-sm leading-relaxed text-[#2b4a8b]">Boss appearance not configured</p></div>
              : visualStage && <BossStage stage={visualStage} stageImages={presentation.stageImages} visibleBounds={presentation.stageVisibleBounds?.[visualStage - 1]} state={bossState} reducedMotion={reducedMotion} />}
          </div>
        </div>
        {!defeated && <div className="col-start-1 row-start-4 h-full min-h-0 min-w-0 self-end lg:absolute lg:col-auto lg:row-auto lg:bottom-8 lg:left-6 lg:z-20 lg:h-[min(40vh,360px)] lg:w-[36vw]"><CommandWindow selectedCap={selectedCap} preview={attackPreview} status={commandStatus} disabled={commandDisabled} onAction={attackFromCommand} onClose={onClose} attackButtonRef={attackButtonRef} /></div>}
        <div className="col-start-2 row-start-4 h-[min(320px,45dvh)] min-h-0 min-w-0 self-end md:z-20 lg:absolute lg:col-auto lg:row-auto lg:bottom-8 lg:left-[54%] lg:right-4 lg:z-20 lg:h-[300px]">
          <DialogWindow
            title={title}
            detail={detail}
            preview={attackPreview}
            selectedCap={selectedCap}
            showAttackQuote={round?.status === 1 && (secondsLeft === null || secondsLeft > 0)}
            walletConnected={Boolean(account)}
            networkMismatch={arena.networkMismatch}
            writeBusy={busy}
            showMessage={!round || !presentation || Boolean(visibleEffect) || busy || round.status !== 1 ||
              (writeMatches && arena.writeState.status !== "idle" && arena.writeState.status !== "confirmed")}
          >
            {live && <BattleActivityLog key={`${arena.network}:${live.hookAddress}:${live.manifest.deploymentTxHash}:${live.rpcUrl}`} live={live} />}
          </DialogWindow>
        </div>
        {defeated && round && !visibleEffect && <div className="col-start-1 row-start-4 mx-auto w-full self-end lg:absolute lg:col-auto lg:row-auto lg:bottom-8 lg:left-6 lg:z-20 lg:max-h-[60vh] lg:w-[40vw] lg:overflow-y-auto">
          <div className="mx-auto w-full max-w-[480px]"><VictoryCard round={round} player={live?.player} onClaim={openActions} onClose={onClose} /></div>
        </div>}
        {sequence && visibleEffect && anchors && (
          <AttackEffects
            phase={sequence.phase}
            effectId={visibleEffect.id}
            origin={anchors.origin}
            target={anchors.target}
            reducedMotion={reducedMotion || !sequence.animate}
            label={effectLabel}
            stageClear={visibleEffect.stageCleared && !visibleEffect.defeated && sequence.phase === "stage-clear"}
          />
        )}
      </div>

      <dialog ref={actionsDialog} aria-labelledby="battle-actions-title" onCancel={(event) => event.stopPropagation()} onClose={() => setApprovalOnly(false)} className={`window-chrome m-auto max-h-[90dvh] overflow-y-auto p-1 backdrop:bg-ink/75 ${approvalOnly ? "w-[min(640px,94vw)]" : "w-[min(800px,94vw)]"}`}>
        <div className="window-title sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-2">
          <h2 id="battle-actions-title" className="font-pixel text-xs">{approvalOnly ? "APPROVE MOCKUSD" : defeated ? "REWARDS" : "BATTLE DETAILS"}</h2>
          <button type="button" autoFocus className="min-h-[44px] border border-white/60 px-3 text-xs text-white" onClick={closeActions}>CLOSE</button>
        </div>
        <div className="px-4 py-4 font-system antialiased sm:px-5">
          <BossActions
            key={identity}
            ref={bossActions}
            arena={arena}
            selectedCap={selectedCap}
            approvalOnly={approvalOnly}
            onApprovalRequired={openApproval}
            onApprovalReady={returnToAttack}
            onQuotePreviewChange={updateAttackPreview}
          />
          {!approvalOnly && (!account || arena.networkMismatch) && <button
            type="button"
            onClick={connectOrSwitch}
            disabled={arena.wallet.busy || arena.wallet.status === "checking" || arena.wallet.status === "missing"}
            className="mt-4 min-h-[44px] border-2 border-[#2b4a8b] px-3 font-pixel text-xs disabled:opacity-50"
          >
            {!account ? "Connect wallet" : "Switch wallet network"}
          </button>}
          {!approvalOnly && arena.wallet.error && <p role="status" className="mt-2 break-words text-sm text-[#a14845]">{arena.wallet.error}</p>}
          {!approvalOnly && live && <details className="mt-4 border-t border-[#2b4a8b]/25 pt-2 text-xs">
            <summary className="min-h-11 cursor-pointer py-3">Contract details</summary>
            <p className="break-all py-2">Hook: {live.hookAddress}</p>
            <p>Confirmed state at block {live.round.blockNumber.toString()}</p>
          </details>}
        </div>
      </dialog>
    </main>
  );
}
