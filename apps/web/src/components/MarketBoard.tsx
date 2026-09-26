"use client";

import { useEffect, useRef } from "react";
import type { DeploymentState } from "@/lib/useBossPool";
import { useUniswapPool } from "@/lib/useUniswapPool";
import { SAMPLE_POOLS, type PoolStat } from "@/lib/poolMath";

function focusHubCanvas() {
  const canvas = document.querySelector("main canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.tabIndex = -1;
  canvas.focus({ preventScroll: true });
}

const ROW_GRID = "grid grid-cols-[1.4fr_1fr_1fr_1fr_0.6fr] items-center gap-2";

function PoolRow({ stat, live }: { stat: PoolStat; live: boolean }) {
  return (
    <div className={`${ROW_GRID} px-3 py-2 font-mono text-[11px] ${live ? "text-fog" : "text-dim"}`}>
      <span className="flex min-w-0 items-center gap-1.5">
        {live && stat.priceLive ? <span className="size-1.5 shrink-0 rounded-full bg-live" aria-hidden /> : null}
        <span className="truncate">{stat.poolLabel}</span>
      </span>
      <span className="tabular-nums">{stat.price}</span>
      <span className="tabular-nums">{stat.volume}</span>
      <span className="tabular-nums">{stat.liquidity}</span>
      <span className="text-right text-dim">{stat.apr}</span>
    </div>
  );
}

/**
 * Pool ledger for the market landmark. Shows the boss's own Uniswap v4 pool with data
 * read straight from the hook, plus a clearly marked ambient sample board. Mirrors the
 * roster/route panels: focus lands on the dialog root, ESC returns to the canvas, and a
 * Tab trap keeps focus inside. No links and no addresses on the sample rows.
 */
export function MarketBoard({ deployment, onClose }: { deployment: DeploymentState; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const stat = useUniswapPool(deployment);

  useEffect(() => {
    // Focus the dialog root, never a control, so the interact key that opened this panel
    // cannot immediately activate a focused button and close it within one keypress.
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
        aria-labelledby="market-board-title"
        aria-describedby="market-board-summary"
        tabIndex={-1}
        className="panel-enter max-h-[min(34rem,calc(100dvh-2rem))] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)] outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow mb-1">MARKET · POOL LEDGER</p>
            <h2 id="market-board-title" className="text-2xl font-semibold tracking-[-0.03em]">
              Boss Pool Ledger
            </h2>
            <p id="market-board-summary" className="mt-1 text-sm leading-relaxed text-muted">
              Live Uniswap v4 data for this boss&rsquo;s own pool, read straight from the hook.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close pool ledger"
            className="shrink-0 rounded-lg border border-white/12 px-3 py-2 font-mono text-[9px] tracking-[0.1em] text-fog focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            CLOSE
          </button>
        </div>

        <div className="hairline mt-5 border-t pt-4">
          <div className={`${ROW_GRID} px-3 pb-1 font-mono text-[9px] tracking-[0.14em] text-dim`}>
            <span>POOL</span>
            <span>PRICE</span>
            <span>VOLUME</span>
            <span>LIQUIDITY</span>
            <span className="text-right">APR</span>
          </div>
          <div className="overflow-hidden rounded-lg border border-white/10 bg-ink/50">
            <PoolRow stat={stat} live />
          </div>
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-faint">
            {stat.priceLive
              ? "Price and volume come from the polled round; liquidity is the current stage\u2019s L (or MockUSD in the pool). APR is illustrative, not a yield guarantee."
              : "Select the live chain and approach the gate to load this pool. APR is illustrative, not a yield guarantee."}
          </p>
        </div>

        <div className="hairline mt-5 border-t pt-4">
          <div className="flex items-center justify-between px-1">
            <p className="eyebrow">TRENDING</p>
            <span className="rounded-md border border-white/12 bg-ink/70 px-2 py-0.5 font-mono text-[8px] tracking-[0.16em] text-faint">
              SAMPLE · AMBIENT
            </span>
          </div>
          <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-ink/40">
            {SAMPLE_POOLS.map((pool) => (
              <PoolRow key={pool.poolLabel} stat={pool} live={false} />
            ))}
          </div>
          <p className="mt-2 px-1 text-[10px] leading-relaxed text-faint">
            Illustrative pools only &mdash; not live, not linked to any address.
          </p>
        </div>
      </div>
    </div>
  );
}
