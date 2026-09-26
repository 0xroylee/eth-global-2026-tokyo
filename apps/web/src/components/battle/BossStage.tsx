"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect, useRef, useState } from "react";
import { STAGE_HUES, type BossVisualState } from "@/lib/mockBattle";

const BOSS_IMAGES = {
  1: "/images/boss-cat-form-a.png",
  2: "/images/boss-cat-form-b.png",
  3: "/images/boss-cat-form-c.png",
} as const;

/**
 * Three-form boss art. Only `transform` and `opacity` animate (no filters,
 * no keyframes): hit = two 120ms ±4px nudges, transition = flattened and
 * faded, next form enters scaled 0.8 → 1, defeated = tilted and dimmed.
 */
export function BossStage({ stage, state }: { stage: 1 | 2 | 3; state: BossVisualState }) {
  const [beat, setBeat] = useState<"left" | "right" | null>(null);
  const [entering, setEntering] = useState(false);
  const prevState = useRef(state);

  // Two-beat hit nudge; the hook flips bossState back to idle after 240ms.
  useEffect(() => {
    if (state !== "hit") {
      setBeat(null);
      return;
    }
    setBeat("left");
    const timer = window.setTimeout(() => setBeat("right"), 120);
    return () => window.clearTimeout(timer);
  }, [state]);

  // After the cleared transition, the next form enters scaled from 0.8.
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
          ? "scale(0.8)"
          : beat === "left"
            ? "translateX(-4px)"
            : beat === "right"
              ? "translateX(4px)"
              : "none";
  const opacity = state === "transition" ? 0.3 : state === "defeated" ? 0.7 : 1;
  const hue = STAGE_HUES[stage - 1];

  return (
    <div className="relative mx-auto flex aspect-square w-full max-w-[360px] items-center justify-center">
      <div
        aria-hidden
        className="absolute inset-8 rounded-full"
        style={{ boxShadow: `0 0 80px ${hue}33` }}
      />
      <img
        src={BOSS_IMAGES[stage]}
        alt=""
        aria-hidden
        className="relative max-h-full max-w-full object-contain transition-[transform,opacity] duration-[120ms] ease-[var(--ease-out-strong)]"
        style={{ transform, opacity }}
      />
    </div>
  );
}
