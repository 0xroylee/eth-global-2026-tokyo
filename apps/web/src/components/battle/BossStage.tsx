"use client";

/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

import { useEffect, useRef, useState } from "react";
import type { BossVisualState } from "@/lib/battle";
import type { BossImageBounds } from "@/game/bosses";

/**
 * Boss sprite, painted directly on the battlefield. The PNGs are transparent;
 * this box has no fill, so the lake shows around the character.
 */
export function BossStage({ stage, stageImages, state, reducedMotion = false, visibleBounds }: {
  stage: 1 | 2 | 3;
  stageImages: readonly [string, string, string];
  state: BossVisualState;
  reducedMotion?: boolean;
  visibleBounds?: BossImageBounds;
}) {
  const [entering, setEntering] = useState(false);
  const prevState = useRef(state);
  const idle = state === "idle" && !entering;

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
          : "none";
  const opacity = state === "transition" ? 0.3 : state === "defeated" ? 0.7 : 1;

  return (
    <div
      className={`relative h-full w-full bg-transparent ${idle && !reducedMotion ? "boss-float" : ""}`}
      style={visibleBounds ? { containerType: "size" } : undefined}
    >
      <img
        src={stageImages[stage - 1]}
        alt=""
        aria-hidden
        className={`boss-sprite absolute ${visibleBounds ? "max-w-none" : "inset-0 h-full w-full object-contain object-bottom"} origin-bottom bg-transparent opacity-100 [image-rendering:pixelated] transition-[transform,opacity] duration-[120ms] ease-[var(--ease-out-strong)] ${state === "hit" && !reducedMotion ? "boss-hit" : ""}`}
        style={{
          ...(visibleBounds ? {
            width: `${visibleBounds.sourceWidth / visibleBounds.height * 100}cqh`,
            height: `${visibleBounds.sourceHeight / visibleBounds.height * 100}%`,
            left: `calc(50% - ${(visibleBounds.x + visibleBounds.width / 2) / visibleBounds.height * 100}cqh)`,
            bottom: `-${(visibleBounds.sourceHeight - visibleBounds.y - visibleBounds.height) / visibleBounds.height * 100}cqh`,
            ...(visibleBounds.clip ? {
              clipPath: `inset(${visibleBounds.y / visibleBounds.sourceHeight * 100}% ${(visibleBounds.sourceWidth - visibleBounds.x - visibleBounds.width) / visibleBounds.sourceWidth * 100}% ${(visibleBounds.sourceHeight - visibleBounds.y - visibleBounds.height) / visibleBounds.sourceHeight * 100}% ${visibleBounds.x / visibleBounds.sourceWidth * 100}%)`,
            } : {}),
          } : {}),
          transform: reducedMotion ? "none" : transform,
          opacity,
          filter: "drop-shadow(3px 4px 0 #041833)",
        }}
      />
    </div>
  );
}
