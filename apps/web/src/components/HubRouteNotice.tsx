"use client";

import { useEffect, useRef } from "react";

function focusHubCanvas() {
  const canvas = document.querySelector("section canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.tabIndex = -1;
  canvas.focus();
}

/** Closed expansion route. Not a boss gate and not a travel action. */
export function HubRouteNotice({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backRef.current?.focus();
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
    <div className="absolute inset-0 z-20 grid place-items-center bg-ink/70 p-4 backdrop-blur-[2px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-route-title"
        className="max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-[340px] overflow-y-auto rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
      >
        <p className="eyebrow mb-1">Coming soon</p>
        <h2 id="hub-route-title" className="text-xl font-semibold tracking-[-0.03em]">
          Next region
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">More boss pools are coming. This route isn't open yet.</p>
        <button
          ref={backRef}
          type="button"
          onClick={onClose}
          className="mt-4 rounded-lg border border-white/12 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-fog transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.97] motion-reduce:transition-opacity motion-reduce:active:scale-100"
        >
          BACK · ESC
        </button>
      </div>
    </div>
  );
}
