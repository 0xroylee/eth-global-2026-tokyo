"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect, useRef } from "react";
import { BOSSES, type BossId } from "@/game/bosses";

const contractedBosses = BOSSES.filter((boss) => boss.source === "chain");

function focusHubCanvas() {
  const canvas = document.querySelector("main canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.tabIndex = -1;
  canvas.focus({ preventScroll: true });
}

/** Boss Actions: only gates that have a contract behind them. */
export function BossContractList({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (bossId: BossId) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      const items = root ? [...root.querySelectorAll<HTMLElement>("button")] : [];
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      focusHubCanvas();
    };
  }, [onClose]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-ink/70 p-4 backdrop-blur-[2px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="boss-contract-list-title"
        className="panel-enter max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)] sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow mb-1">BOSS ACTIONS</p>
            <h2 id="boss-contract-list-title" className="text-2xl font-semibold tracking-[-0.03em]">
              Bosses with contracts
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close boss actions"
            className="shrink-0 rounded-lg border border-white/12 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-fog focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            CLOSE
          </button>
        </div>

        {contractedBosses.length === 0 ? (
          <p className="mt-5 rounded-lg border border-white/8 px-3 py-3 text-sm text-muted">
            No boss with a contract is available.
          </p>
        ) : (
          <ul className="mt-5 flex flex-col gap-2">
            {contractedBosses.map((boss) => (
              <li key={boss.id}>
                <button
                  type="button"
                  onClick={() => onSelect(boss.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-ink/30 px-3 py-3 text-left transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-ink">
                    {boss.portrait ? (
                      <img src={boss.portrait} alt="" className="size-full object-cover object-top [image-rendering:pixelated]" />
                    ) : (
                      <span className="font-mono text-sm text-dim">{boss.ticker.slice(0, 2)}</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold tracking-[-0.02em]">{boss.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted">{boss.tagline}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-live/30 px-2 py-0.5 font-mono text-[8px] tracking-[0.12em] text-live-soft">
                    CONTRACT
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
