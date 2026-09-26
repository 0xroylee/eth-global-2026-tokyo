"use client";

import { useEffect, useRef } from "react";
import type { GuideStep } from "@/lib/hubGuide";

const COPY: Record<Exclude<GuideStep, "hidden" | "welcome">, { label: string; text: string }> = {
  move: { label: "MOVE", text: "Use WASD or arrow keys to move." },
  find: { label: "FIND", text: "Find a boss pool to challenge." },
  inspect: { label: "INSPECT", text: "Press E to inspect this boss pool." },
  done: { label: "READY", text: "You're ready to explore. Choose a boss pool whenever you're ready." },
};

export function HubGuide({
  step,
  showHint,
  onStart,
  onSkip,
  onDismiss,
}: {
  step: GuideStep;
  showHint: boolean;
  onStart: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}) {
  if (step === "welcome") return <WelcomeDialog onStart={onStart} onSkip={onSkip} />;
  if (!showHint || step === "hidden") return null;
  const copy = COPY[step];
  return (
    <div className="pointer-events-auto relative z-10 max-w-[240px] rounded-lg border border-[#f5b04a]/40 bg-ink/90 px-3 py-2 motion-reduce:transition-none">
      <p className="font-mono text-[8px] tracking-[0.16em] text-[#f5b04a]">{copy.label}</p>
      <p aria-live="polite" className="mt-1 text-[12px] leading-snug text-fog">
        {copy.text}
      </p>
      {step === "done" ? (
        <button type="button" onClick={onDismiss} className={buttonClass}>
          DISMISS
        </button>
      ) : (
        <button type="button" onClick={onSkip} className={buttonClass}>
          SKIP
        </button>
      )}
    </div>
  );
}

function WelcomeDialog({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    startRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onSkip();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = [...root.querySelectorAll<HTMLElement>("button")];
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
  }, [onSkip]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-ink/70 p-4 backdrop-blur-[2px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hub-guide-title"
        className="max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-[340px] overflow-y-auto rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)] transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)] motion-reduce:transition-opacity"
      >
        <p className="eyebrow mb-1">HUB</p>
        <h2 id="hub-guide-title" className="text-xl font-semibold tracking-[-0.03em]">
          Welcome to Boss Pool
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">Explore the garden and find a boss pool to challenge.</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Explore freely. Connect your wallet when you're ready to challenge a boss pool.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-dim">Sound is optional—you can enable it above the map.</p>
        <div className="mt-4 flex gap-2">
          <button ref={startRef} type="button" onClick={onStart} className={`${buttonClass} flex-1 bg-accent/20 text-accent-soft`}>
            START GAME
          </button>
          <button type="button" onClick={onSkip} className={buttonClass}>
            SKIP
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReplayGuide({ disabled, onReplay }: { disabled: boolean; onReplay: () => void }) {
  return (
    <button
      type="button"
      onClick={onReplay}
      disabled={disabled}
      className="self-start rounded-md border border-white/12 px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-dim transition-opacity duration-150 hover:text-fog disabled:opacity-40 motion-reduce:transition-none"
    >
      REPLAY GUIDE
    </button>
  );
}

const buttonClass =
  "mt-2 rounded-lg border border-white/12 px-3 py-2 font-mono text-[11px] tracking-[0.14em] text-fog transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.97] motion-reduce:transition-opacity motion-reduce:active:scale-100";
