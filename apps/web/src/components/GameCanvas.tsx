"use client";

import { useEffect, useRef, useState } from "react";
import type { GameBridge } from "@/game/bridge";

export type CanvasPhase = "loading" | "ready" | "error";

const LOAD_TIMEOUT_MS = 20_000;

/**
 * Hosts the Phaser canvas. Phaser touches `window` at import time, so the
 * game module is loaded inside an effect, never during render or SSR.
 * Each attempt has its own generation so a late import or scene-ready cannot
 * overwrite a newer retry.
 */
export function GameCanvas({ bridge, onPhase }: { bridge: GameBridge; onPhase?: (phase: CanvasPhase) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<CanvasPhase>("loading");
  const [attempt, setAttempt] = useState(0);
  const onPhaseRef = useRef(onPhase);
  onPhaseRef.current = onPhase;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let game: import("phaser").Game | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const publish = (next: CanvasPhase) => {
      if (cancelled && next !== "error") return;
      setPhase(next);
      onPhaseRef.current?.(next);
    };

    const fail = () => {
      if (cancelled) return;
      cancelled = true;
      if (timer) clearTimeout(timer);
      const doomed = game;
      game = undefined;
      doomed?.destroy(true);
      host.replaceChildren();
      publish("error");
    };

    publish("loading");
    timer = setTimeout(fail, LOAD_TIMEOUT_MS);
    const offReady = bridge.on("scene:ready", () => {
      if (cancelled) {
        game?.destroy(true);
        game = undefined;
        host.replaceChildren();
        return;
      }
      if (timer) clearTimeout(timer);
      publish("ready");
    });
    const offError = bridge.on("scene:error", () => fail());

    void import("@/game/createGame")
      .then(({ createGame }) => {
        if (cancelled) return;
        try {
          const created = createGame(host, bridge);
          if (cancelled) {
            created.destroy(true);
            host.replaceChildren();
            return;
          }
          game = created;
        } catch {
          fail();
        }
      })
      .catch(() => fail());

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      offReady();
      offError();
      game?.destroy(true);
      game = undefined;
      host.replaceChildren();
    };
  }, [attempt, bridge]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-white/10 bg-ink shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div
        ref={hostRef}
        className={`absolute inset-0 transition-opacity duration-[250ms] ease-[var(--ease-out-strong)] motion-reduce:transition-none [&>canvas]:!h-full [&>canvas]:!w-full [&>canvas]:[image-rendering:pixelated] ${
          phase === "ready" ? "opacity-100" : "opacity-0"
        }`}
      />
      {phase === "loading" && (
        <div className="absolute inset-0 grid place-items-center font-mono text-[10px] tracking-[0.2em] text-dim">LOADING HUB</div>
      )}
      {phase === "error" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-ink/95 p-6 text-center">
          <div>
            <p className="text-sm text-fog">Couldn't load the garden.</p>
            <button
              type="button"
              onClick={() => setAttempt((current) => current + 1)}
              className="mt-4 rounded-lg border border-white/12 px-4 py-2 font-mono text-[11px] tracking-[0.14em] text-fog transition-[opacity,transform] duration-150 ease-[var(--ease-out-strong)] hover:bg-white/5 active:scale-[0.97] motion-reduce:transition-opacity motion-reduce:active:scale-100"
            >
              RETRY
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
