"use client";

import { useEffect, useState, type RefObject } from "react";

/** Optional browser fullscreen for the game shell. The full-window layout does not depend on it. */
export function FullscreenControl({ target }: { target: RefObject<HTMLElement | null> }) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const element = target.current;
    const available = typeof document !== "undefined" && document.fullscreenEnabled && !!element?.requestFullscreen;
    setSupported(available);
    const onChange = () => setActive(document.fullscreenElement === target.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [target]);

  const toggle = async () => {
    const element = target.current;
    if (!element || !document.fullscreenEnabled) return;
    try {
      if (document.fullscreenElement === element) {
        await document.exitFullscreen();
        return;
      }
      if (document.fullscreenElement) return;
      await element.requestFullscreen();
    } catch {
      setActive(document.fullscreenElement === element);
    }
  };

  if (!supported) {
    return (
      <span
        className="rounded-md border border-white/12 px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-dim"
        title="Fullscreen isn't available in this browser. The garden still fills the window."
      >
        FULLSCREEN UNAVAILABLE
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        // Blur so the focused button does not swallow the next Enter (see GameShell).
        if (event.detail > 0) event.currentTarget.blur();
        void toggle();
      }}
      aria-pressed={active}
      aria-label={active ? "Exit fullscreen" : "Enter fullscreen"}
      className="rounded-md border border-white/12 px-2 py-1 font-mono text-[9px] tracking-[0.12em] text-dim transition-opacity duration-150 motion-reduce:transition-none"
    >
      {active ? "EXIT FULLSCREEN" : "FULLSCREEN"}
    </button>
  );
}
