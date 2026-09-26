"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect, useRef, useState } from "react";
import { STAGE_HUES, type BossVisualState } from "@/lib/battle";

const BOSS_IMAGES = {
  1: "/images/boss-cat-form-b.png",
  2: "/images/boss-cat-form-a.png",
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
    <div className="relative h-full w-full">
      <div
        aria-hidden
        className="absolute inset-8 rounded-full"
        style={{ boxShadow: `0 0 80px ${hue}33` }}
      />
      <img
        src={BOSS_IMAGES[stage]}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated] transition-[transform,opacity] duration-[120ms] ease-[var(--ease-out-strong)]"
        style={{ transform, opacity }}
      />
      {/* Stone slab plinth echoing arena-lake-background.png's platform. */}
      <div
        aria-hidden
        className="absolute bottom-[7%] left-1/2 h-[6%] w-[62%] -translate-x-1/2 bg-[#66728e] [clip-path:polygon(12%_0,88%_0,100%_100%,0_100%)]"
      />
      <div
        aria-hidden
        className="absolute bottom-[2%] left-1/2 h-[3%] w-[72%] -translate-x-1/2 rounded-[50%] bg-[#080b14]/60"
      />
    </div>
  );
}
