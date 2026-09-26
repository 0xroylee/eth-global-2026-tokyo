"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTypewriter } from "@/lib/useTypewriter";

function focusHubCanvas() {
  const canvas = document.querySelector("main canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.tabIndex = -1;
  canvas.focus({ preventScroll: true });
}

/**
 * Scripted sage conversation. One line at a time: the first interact key
 * finishes the line, the next one moves on, and the last one closes.
 *
 * The typed paragraph is hidden from assistive tech so a screen reader hears
 * each line once, when it is complete, instead of character by character.
 */
export function SageDialog({ lines, onClose }: { lines: string[]; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const line = lines[index] ?? "";
  const { shown, done, complete } = useTypewriter(line);
  const lastLine = index >= lines.length - 1;

  const advance = useCallback(() => {
    if (!done) {
      complete();
      return;
    }
    if (lastLine) {
      onClose();
      return;
    }
    setIndex((current) => current + 1);
  }, [complete, done, lastLine, onClose]);

  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const root = dialogRef.current;
        const items = root ? [...root.querySelectorAll<HTMLElement>("button")] : [];
        const first = items[0];
        const lastItem = items[items.length - 1];
        if (!first || !lastItem || !root) return;
        const active = document.activeElement;
        if (!(active instanceof HTMLElement) || !root.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? lastItem : first).focus();
        } else if (!event.shiftKey && active === lastItem) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          lastItem.focus();
        }
        return;
      }
      if (event.key !== "e" && event.key !== "E" && event.key !== "Enter" && event.key !== " ") return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      event.preventDefault();
      advance();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      focusHubCanvas();
    };
  }, [advance, onClose]);

  const nextLabel = !done ? "E · FINISH LINE" : lastLine ? "E · CLOSE" : "E · NEXT";
  const nextDescription = !done ? "Show the rest of this line" : lastLine ? "Close the sage" : "Next line";

  return (
    <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-ink/70 p-4 backdrop-blur-[2px]">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sage-dialog-title"
        tabIndex={-1}
        className="panel-enter max-h-[min(32rem,calc(100dvh-2rem))] w-full max-w-[420px] overflow-y-auto rounded-2xl border border-white/12 bg-panel/95 p-5 shadow-[0_30px_90px_rgba(0,0,0,0.6)] outline-none"
      >
        <p className="eyebrow mb-1">SAGE · GARDEN</p>
        <h2 id="sage-dialog-title" className="text-xl font-semibold tracking-[-0.03em]">
          THE SAGE
        </h2>
        <div className="mt-3 min-h-[5.5rem]">
          {lines.slice(0, index).map((past) => (
            <p key={past} className="text-sm leading-relaxed text-dim">
              {past}
            </p>
          ))}
          <p aria-hidden="true" className="text-sm leading-relaxed text-fog">
            {shown}
            {!done && <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-[1px] bg-accent-soft" />}
          </p>
          <p aria-live="polite" className="sr-only">
            {done ? line : ""}
          </p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            ref={nextRef}
            type="button"
            onClick={advance}
            aria-label={nextDescription}
            className="rounded-lg border border-white/12 px-4 py-2.5 font-mono text-[11px] tracking-[0.14em] text-fog transition-opacity duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.97] motion-reduce:transition-opacity motion-reduce:active:scale-100"
          >
            {nextLabel}
          </button>
          <span className="font-mono text-[9px] tracking-[0.12em] text-dim">ESC · CLOSE</span>
        </div>
      </div>
    </div>
  );
}
