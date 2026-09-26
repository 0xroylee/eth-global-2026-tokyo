"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect, useRef } from "react";
import type { BossDefinition, BossStatus } from "@/game/bosses";

const STATUS_LABEL: Record<BossStatus, string> = {
  active: "ACTIVE",
  "no-contract": "NO CONTRACT",
  locked: "LOCKED",
};

function focusHubCanvas() {
  const canvas = document.querySelector("main canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.tabIndex = -1;
  canvas.focus({ preventScroll: true });
}

/**
 * Gate presentation for entries that have no contract behind them. It shows the
 * hidden boss instead of battle actions, and it never implies a live pool.
 */
export function BossRosterCard({ boss, onClose }: { boss: BossDefinition; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus the dialog root, never a control. The interact key that opened this card is
    // still being dispatched: moving focus onto the CLOSE button let that same keystroke's
    // default action click it, so the card opened and closed within one keypress. A
    // tabIndex={-1} container carries the focus cue without owning Enter/Space. Same shape
    // as SageDialog, which is why that dialog never had this defect.
    dialogRef.current?.focus({ preventScroll: true });
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
      const active = document.activeElement;
      // The root is where focus starts, so it is also the trap's outer edge: Shift+Tab
      // from it must wrap to the last control instead of leaving the dialog.
      if (event.shiftKey && (active === first || active === root)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
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
        aria-labelledby="boss-roster-title"
        aria-describedby="boss-roster-summary"
        tabIndex={-1}
        className="panel-enter max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-[480px] overflow-y-auto rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)] outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-4">
            <div
              className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-ink"
              style={{ borderColor: `${boss.accent}59` }}
            >
              {boss.portrait ? (
                <img src={boss.portrait} alt="" className="size-full object-cover object-top [image-rendering:pixelated]" />
              ) : (
                <span className="font-mono text-2xl tracking-[0.08em]" style={{ color: boss.accent }}>
                  {boss.ticker.slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="eyebrow mb-1">HIDDEN GATE</p>
              <h2 id="boss-roster-title" className="flex flex-wrap items-baseline gap-2 text-2xl font-semibold tracking-[-0.03em]">
                {boss.name}
                <span className="font-mono text-[11px] tracking-[0.14em]" style={{ color: boss.accent }}>
                  {boss.ticker}
                </span>
              </h2>
              <p id="boss-roster-summary" className="mt-1 text-sm leading-relaxed text-muted">
                {boss.tagline}
              </p>
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close challenger card"
            className="shrink-0 rounded-lg border border-white/12 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-fog focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            CLOSE
          </button>
        </div>

        <div className="hairline mt-5 border-t pt-4">
          <span className="inline-flex rounded-md border border-white/12 bg-ink/70 px-2 py-1 font-mono text-[9px] tracking-[0.16em] text-dim">
            {STATUS_LABEL[boss.status]}
          </span>
          <p className="mt-4 text-xs leading-relaxed text-dim">
            No contract is deployed, so there is no pool to challenge here yet.
          </p>
        </div>
      </div>
    </div>
  );
}
