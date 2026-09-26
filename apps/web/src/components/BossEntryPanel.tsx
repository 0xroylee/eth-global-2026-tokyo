"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect, useRef } from "react";
import Link from "next/link";
import { getDefaultBossHook } from "@boss-pool/chain";
import type { BossDefinition } from "@/game/bosses";
import { displayAmount, roundStatusLabel } from "@/lib/format";
import { type useBossPool } from "@/lib/useBossPool";

type Arena = ReturnType<typeof useBossPool>;
const CAT_FORMS = ["/images/boss-cat-form-a.png", "/images/boss-cat-form-b.png", "/images/boss-cat-form-c.png"] as const;

export function BossEntryPanel({
  boss,
  arena,
  onClose,
  suspendInput = false,
}: {
  boss: BossDefinition;
  arena: Arena;
  onClose: () => void;
  suspendInput?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const entryRef = useRef<HTMLAnchorElement>(null);
  const candidate = arena.deployment.kind === "live" ? arena.deployment : null;
  const live = candidate && candidate.hookAddress.toLowerCase() === getDefaultBossHook(candidate.context.baseManifest).toLowerCase()
    ? candidate
    : null;
  const stage = live?.round.currentStage ?? 0;
  const portrait = boss.id === "cat" ? CAT_FORMS[Math.min(stage, 2)] : boss.portrait;
  const supported = boss.id === "cat";
  const canEnter = supported && Boolean(live);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    if (suspendInput) return;
    (canEnter ? entryRef : closeRef).current?.focus();
  }, [canEnter, suspendInput]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="boss-entry-title"
      inert={suspendInput}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!suspendInput) onClose();
      }}
      className="window-chrome panel-enter m-auto max-h-[calc(100dvh-2rem)] w-[min(560px,calc(100vw-2rem))] overflow-y-auto p-1 backdrop:bg-ink/70 backdrop:backdrop-blur-[2px]"
    >
      <div className="window-title flex items-center justify-between gap-3 py-1 pl-4 pr-1">
        <p className="text-xs">{boss.locked ? "GATE LOCKED" : supported ? "BOSS GATE" : "FIXTURE ONLY"}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close boss actions"
          className="min-h-11 shrink-0 border border-white/60 px-3 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4ff]"
        >
          CLOSE
        </button>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="grid size-24 shrink-0 place-items-center overflow-hidden border-2 border-[#2b4a8b] bg-[#092b61]">
            {portrait ? (
              <img src={portrait} alt="" className="size-full object-cover object-top [image-rendering:pixelated]" />
            ) : (
              <span className="font-pixel text-2xl text-[#fff9e9]">?</span>
            )}
          </div>
          <div className="min-w-0">
            <h2 id="boss-entry-title" className="font-pixel text-xl leading-tight sm:text-2xl">
              {boss.name}
            </h2>
            <p className="mt-2 font-mono text-xs leading-relaxed">{boss.tagline}</p>
          </div>
        </div>

        <div className="mt-5 border-t-2 border-[#2b4a8b]/20 pt-4">
          <BossHealth boss={boss} deployment={arena.deployment} />
        </div>

        {supported && live && (
          <div className="mt-6">
            <div className="mb-5 border-y-2 border-[#2b4a8b]/20 py-3">
              <dl className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="font-pixel text-xs">EXTRA POOL PRIZE</dt>
                <dd className="font-pixel text-xl [overflow-wrap:anywhere]">
                  {displayAmount(live.round.originalPrize, live.round.rewardToken.decimals)} {live.round.rewardToken.symbol}
                </dd>
              </dl>
              <p className="mt-2 font-mono text-xs leading-relaxed">
                Shared by eligible fighters after the final stage.
              </p>
            </div>
            <Link
              ref={entryRef}
              href={`/battle/${live.hookAddress}?network=${arena.network}`}
              aria-describedby="boss-entry-cost"
              className="flex min-h-16 w-full items-center justify-center gap-3 border-2 border-[#092b61] bg-[#092b61] px-4 py-4 font-pixel text-xl text-[#fff9e9] shadow-[0_4px_0_#041833] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2b4a8b] active:bg-[#2b4a8b]"
            >
              <span aria-hidden="true">▶</span>
              ENTER BATTLE
            </Link>
            <p id="boss-entry-cost" className="mt-4 text-center font-mono text-xs leading-relaxed">Each attack uses a cap of up to 1, 5, or 10 MockUSD.</p>
          </div>
        )}
        {!supported && (
          <p className="mt-4 font-mono text-xs leading-relaxed">
            This gate is a visual fixture. No contract or attack route is deployed for it.
          </p>
        )}
      </div>
    </dialog>
  );
}

function BossHealth({ boss, deployment }: { boss: BossDefinition; deployment: Arena["deployment"] }) {
  if (boss.id !== "cat") {
    return (
      <Row label="BOSS HP" badge="NO CONTRACT YET">
        <Bar fraction={null} />
      </Row>
    );
  }
  if (deployment.kind !== "live") {
    return (
      <Row label="BOSS HP" badge={deployment.kind === "loading" ? "CHECKING CHAIN" : "LIVE DATA UNAVAILABLE"}>
        <Bar fraction={null} />
      </Row>
    );
  }
  const { round } = deployment;
  const stage = round.currentStage;
  const factory = round.encounterMode === "factory";
  const cap = factory ? round.stageVolumeTarget[stage] ?? 0n : round.stageCapacity[stage] ?? 0n;
  const sold = factory ? round.stageVolume[stage] ?? 0n : round.stageSold[stage] ?? 0n;
  const remaining = factory ? (cap > sold ? cap - sold : 0n) : round.remainingSellableHP;
  const fraction = cap > 0n ? Number((remaining * 1000n) / cap) / 1000 : 0;
  return (
    <Row label={`STAGE ${stage + 1} / 3 · ${roundStatusLabel(round.status).toUpperCase()}`} badge="LIVE">
      <Bar fraction={fraction} />
      <p className="mt-2 font-mono text-xs leading-relaxed">
        {factory
          ? `${displayAmount(sold, 6)} / ${displayAmount(cap, 6)} mUSD volume`
          : `${displayAmount(remaining, round.hpToken.decimals)} / ${displayAmount(cap, round.hpToken.decimals)} ${round.hpToken.symbol} remaining`}
      </p>
    </Row>
  );
}

function Row({ label, badge, children }: { label: string; badge: string; children: React.ReactNode }) {
  const live = badge === "LIVE";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-pixel text-[11px]">{label}</span>
        <span
          className={`border px-2 py-1 font-mono text-[10px] tracking-[0.08em] ${
            live ? "border-[#276334] bg-[#57c858]/15 text-[#276334]" : "border-[#2b4a8b]/40"
          }`}
        >
          {badge}
        </span>
      </div>
      {children}
    </div>
  );
}

function Bar({ fraction }: { fraction: number | null }) {
  return (
    <div className="bar-track h-4 overflow-hidden border-2 border-[#2b4a8b]" role="progressbar" aria-label="Boss health remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fraction === null ? undefined : Math.round(fraction * 100)}>
      {fraction === null ? (
        <div className="h-full w-full bg-[repeating-linear-gradient(135deg,rgba(169,214,255,0.2)_0_6px,transparent_6px_12px)]" />
      ) : (
        <div
          className="h-full origin-left bg-[#57c858] transition-transform duration-300 ease-[var(--ease-out-strong)] motion-reduce:transition-none"
          style={{ transform: `scaleX(${fraction})` }}
        />
      )}
    </div>
  );
}
