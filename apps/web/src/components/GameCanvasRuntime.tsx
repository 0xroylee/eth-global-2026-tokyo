"use client";

import { useEffect, useRef, useState } from "react";
import type { GameBridge } from "@/game/bridge";

/** The game engine is imported only after this component mounts in the browser. */
export function GameCanvasRuntime({ bridge }: { bridge: GameBridge }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let game: import("phaser").Game | undefined;
    const offReady = bridge.on("scene:ready", () => setBooting(false));

    void import("@/game/createGame").then(({ createGame }) => {
      if (!disposed) game = createGame(host, bridge);
    });

    return () => {
      disposed = true;
      offReady();
      game?.destroy(true);
    };
  }, [bridge]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-ink shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div ref={hostRef} className="absolute inset-0 [&>canvas]:!h-full [&>canvas]:!w-full" />
      {booting && (
        <div className="absolute inset-0 grid place-items-center font-mono text-[10px] tracking-[0.2em] text-dim">
          LOADING HUB
        </div>
      )}
    </div>
  );
}
