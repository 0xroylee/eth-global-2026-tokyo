"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect, useRef, useState } from "react";
import type { BossVisualState } from "@/lib/battle";

/**
 * Boss sprite, painted directly on the battlefield. The PNGs are transparent;
 * this box has no fill, so the lake shows around the character.
 */
export function BossStage({ stage, stageImages, state, reducedMotion = false }: {
  stage: 1 | 2 | 3;
  stageImages: readonly [string, string, string];
  state: BossVisualState;
  reducedMotion?: boolean;
}) {
  const [beat, setBeat] = useState<"left" | "right" | null>(null);
  const [entering, setEntering] = useState(false);
  const prevState = useRef(state);
  const idle = state === "idle" && !entering;

  useEffect(() => {
    if (state !== "hit" || reducedMotion) {
      setBeat(null);
      return;
    }
    setBeat("left");
    const timer = window.setTimeout(() => setBeat("right"), 120);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, state]);

  useEffect(() => {
    if (prevState.current === "transition" && state !== "transition") {
      setEntering(true);
      const raf = requestAnimationFrame(() => setEntering(false));
      prevState.current = state;
      return () => cancelAnimationFrame(raf);
    }
    prevState.current = state;
  }, [state]);

  const transform =
    state === "defeated"
      ? "rotate(8deg)"
      : state === "transition"
        ? "scaleY(0.4)"
        : entering
          ? "scale(0.92)"
          : beat === "left"
            ? "translateX(-4px)"
            : beat === "right"
              ? "translateX(4px)"
              : "none";
  const opacity = state === "transition" ? 0.3 : state === "defeated" ? 0.7 : 1;

  return (
    <div
      className={`relative h-full w-full bg-transparent ${idle ? "boss-float" : ""}`}
    >
      <img
        src={stageImages[stage - 1]}
        alt=""
        aria-hidden
        className="boss-sprite absolute inset-0 h-full w-full bg-transparent object-contain object-bottom opacity-100 [image-rendering:pixelated] transition-[transform,opacity] duration-[120ms] ease-[var(--ease-out-strong)]"
        style={{
          transform,
          opacity,
          filter: "drop-shadow(3px 4px 0 #041833)",
        }}
      />
    </div>
  );
}
