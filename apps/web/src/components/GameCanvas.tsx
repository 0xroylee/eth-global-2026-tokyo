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
      <div className="grid aspect-[16/10] w-full place-items-center rounded-xl border border-white/10 bg-ink font-mono text-[10px] tracking-[0.2em] text-dim">
        LOADING HUB
      </div>
    ),
  },
);

export function GameCanvas({ bridge, onPhase }: { bridge: GameBridge; onPhase?: (phase: CanvasPhase) => void }) {
  return <GameCanvasRuntime bridge={bridge} onPhase={onPhase} />;
}
