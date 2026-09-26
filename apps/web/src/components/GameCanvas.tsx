"use client";

import dynamic from "next/dynamic";
import type { GameBridge } from "@/game/bridge";

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

export function GameCanvas({ bridge }: { bridge: GameBridge }) {
  return <GameCanvasRuntime bridge={bridge} />;
}
