"use client";

import { useEffect, useRef } from "react";

const CONTROLS = [
  ["WASD / arrow keys", "Move around the garden. WASD also closes game panels."],
  ["E", "Inspect a nearby boss pool or route"],
  ["Escape", "Close the current panel"],
  ["Sound / Music", "Optional audio controls above the map"],
] as const;

/** Movement and audio help. Replay closes this dialog before Welcome opens. */
export function HubHelp({ onClose, onReplay }: { onClose: () => void; onReplay: () => void }) {
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
    };
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-ink/70 p-4 backdrop-blur-[2px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-help-title"
        className="max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-[380px] overflow-y-auto rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)]"
      >
        <p className="eyebrow mb-1">HUB</p>
        <h2 id="hub-help-title" className="text-xl font-semibold tracking-[-0.03em]">
          Help
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">Find a boss pool to challenge. Closed routes lead to future regions.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Explore freely. Connect your wallet when you're ready to challenge a boss pool.
        </p>
        <dl className="mt-4 space-y-2">
          {CONTROLS.map(([control, description]) => (
            <div key={control} className="grid gap-1 text-[12px] leading-snug sm:grid-cols-[9.5rem_1fr] sm:gap-2">
              <dt className="font-mono text-[10px] tracking-[0.08em] text-fog">{control}</dt>
              <dd className="text-muted">{description}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            ref={backRef}
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/12 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-fog transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.97] motion-reduce:transition-opacity motion-reduce:active:scale-100"
          >
            BACK · ESC
          </button>
          <button
            type="button"
            onClick={onReplay}
            className="rounded-lg border border-[#f5b04a]/40 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-[#f5b04a] transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.97] motion-reduce:transition-opacity motion-reduce:active:scale-100"
          >
            REPLAY GUIDE
          </button>
        </div>
      </div>
    </div>
  );
}
