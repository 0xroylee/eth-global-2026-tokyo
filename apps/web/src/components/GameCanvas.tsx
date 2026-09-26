"use client";

import dynamic from "next/dynamic";
import type { GameBridge } from "@/game/bridge";
import type { CanvasPhase } from "./GameCanvasRuntime";

export type { CanvasPhase } from "./GameCanvasRuntime";

const GameCanvasRuntime = dynamic(
  () => import("./GameCanvasRuntime").then((module) => module.GameCanvasRuntime),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 grid place-items-center bg-ink font-mono text-[10px] tracking-[0.2em] text-dim">
        LOADING HUB
      </div>
    ),
  },
);

export function GameCanvas({ bridge, onPhase }: { bridge: GameBridge; onPhase?: (phase: CanvasPhase) => void }) {
  return (
    <div className="absolute inset-0">
      <GameCanvasRuntime bridge={bridge} onPhase={onPhase} />
    </div>
  );
}
