"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect, useRef, useState } from "react";
import type { BossVisualState } from "@/lib/mockBattle";

/** Stage 1 form A, stage 2 form B, stage 3 form C. */
const BOSS_IMAGES = {
  1: "/images/boss-cat-form-a.png?v=6",
  2: "/images/boss-cat-form-b.png?v=6",
  3: "/images/boss-cat-form-c.png?v=8",
} as const;

/**
 * Boss sprite, painted directly on the battlefield. The PNGs are transparent;
 * this box has no fill, so the lake shows around the character.
 */
export function BossStage({ stage, state }: { stage: 1 | 2 | 3; state: BossVisualState }) {
  const [beat, setBeat] = useState<"left" | "right" | null>(null);
  const [entering, setEntering] = useState(false);
  const prevState = useRef(state);
  const idle = state === "idle" && !entering;

  useEffect(() => {
    if (state !== "hit") {
      setBeat(null);
      return;
    }
    setBeat("left");
    const timer = window.setTimeout(() => setBeat("right"), 120);
    return () => window.clearTimeout(timer);
  }, [state]);

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
      className="boss-float relative h-full w-full bg-transparent"
      style={idle ? { animation: "boss-float 2.8s ease-in-out infinite alternate" } : undefined}
    >
      <img
        src={BOSS_IMAGES[stage]}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full bg-transparent object-contain object-bottom opacity-100 [image-rendering:pixelated] transition-[transform,opacity] duration-[120ms] ease-[var(--ease-out-strong)]"
        style={{
          transform,
          opacity,
          filter: "drop-shadow(3px 4px 0 #041833)",
        }}
      />
    </div>
  );
}
