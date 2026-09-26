"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FactoryHooks } from "@/game/FactoryScene";
import { PixelFactory } from "./PixelFactory";
import { useBoostPadForm } from "./useBoostPadForm";

/**
 * Game flow. The player walks the smithy and talks to the blacksmith, which opens the form.
 * Direct visits open the same form immediately.
 */
export function FactoryWalk({ initiallyOpen = false }: { initiallyOpen?: boolean }) {
  const pad = useBoostPadForm(initiallyOpen);
  const router = useRouter();
  const hostRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const closeRef = useRef(pad.closeForm);
  const leaveRef = useRef<(path: string) => void>(() => undefined);
  pausedRef.current = pad.formOpen;
  closeRef.current = pad.closeForm;
  leaveRef.current = router.push;
  const [near, setNear] = useState(false);
  const [atDoor, setAtDoor] = useState(false);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [soundOn, setSoundOn] = useState(false);
  const soundRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  soundRef.current = soundOn;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let game: import("phaser").Game | undefined;
    const hooks: FactoryHooks = {
      paused: () => pausedRef.current,
      onNear: (value) => {
        if (!cancelled) setNear(value);
      },
      onDoor: (value) => {
        if (!cancelled) setAtDoor(value);
      },
      onTalk: () => {
        if (!cancelled) pad.openForm();
      },
      onLeave: () => {
        if (!cancelled) leaveRef.current("/");
      },
      onStrike: () => {
        const context = audioRef.current;
        if (!soundRef.current || !context || context.state !== "running" || document.hidden) return;
        const start = context.currentTime;
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(210, start);
        oscillator.frequency.exponentialRampToValueAtTime(80, start + 0.04);
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(0.02, start + 0.008);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
        oscillator.connect(envelope).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.08);
      },
      onReady: () => {
        if (!cancelled) setPhase("ready");
      },
      onError: () => {
        if (!cancelled) setPhase("error");
      },
    };

    void import("@/game/createFactoryGame")
      .then(({ createFactoryGame }) => {
        if (cancelled) return;
        game = createFactoryGame(host, hooks);
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });

    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !pausedRef.current || event.defaultPrevented) return;
      // The wallet chooser/menu owns Escape while it is above this dialog.
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not([aria-label="Blacksmith"])')) return;
      event.preventDefault();
      closeRef.current();
    };
    window.addEventListener("keydown", onEscape);
    const onHide = () => {
      if (document.hidden) void audioRef.current?.suspend();
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onEscape);
      document.removeEventListener("visibilitychange", onHide);
      const context = audioRef.current;
      audioRef.current = null;
      void context?.close().catch(() => undefined);
      game?.destroy(true);
      host.replaceChildren();
    };
    // The scene keeps the hook object; openForm identity changes would reboot the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pad.formOpen) return;
    const previous = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [pad.formOpen]);

  const toggleSound = async () => {
    if (soundRef.current) {
      soundRef.current = false;
      setSoundOn(false);
      await audioRef.current?.suspend();
      return;
    }
    const context = audioRef.current ?? new AudioContext();
    audioRef.current = context;
    await context.resume();
    if (context.state !== "running") return;
    soundRef.current = true;
    setSoundOn(true);
  };

  return (
    <main className="relative h-dvh overflow-hidden bg-[#1a1612] text-fog">
      <div ref={hostRef} className="absolute inset-0 [&>canvas]:[image-rendering:pixelated]" />
      {phase === "loading" ? (
        <p className="pointer-events-none absolute inset-0 grid place-items-center font-mono text-[10px] tracking-[0.2em] text-dim">
          LOADING BLACKSMITH
        </p>
      ) : null}
      {phase === "error" ? (
        <p className="absolute inset-0 grid place-items-center font-mono text-[10px] tracking-[0.16em] text-danger">
          BLACKSMITH FAILED TO LOAD
        </p>
      ) : null}

      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] tracking-[0.22em] text-dim">BOSS POOL</p>
            <h1 className="text-sm font-semibold tracking-[0.14em]">BLACKSMITH</h1>
            <button
              type="button"
              aria-pressed={soundOn}
              aria-label="Workshop sound effects"
              onClick={() => void toggleSound()}
              className="pointer-events-auto mt-2 inline-flex min-h-9 items-center rounded-md border border-white/20 bg-ink/85 px-2.5 font-mono text-[9px] tracking-[0.12em] text-fog"
            >
              SOUND · {soundOn ? "ON" : "OFF"}
            </button>
          </div>
          <Link
            href="/"
            className="pointer-events-auto rounded-lg border border-white/15 bg-ink/70 px-3 py-2 font-mono text-[10px] tracking-[0.14em]"
          >
            BACK TO HUB
          </Link>
        </header>
        <p
          aria-live="polite"
          className={`mx-auto rounded-md border border-white/12 bg-ink/85 px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] ${
            (near || atDoor) && !pad.formOpen ? "opacity-100" : "opacity-0"
          }`}
        >
          {atDoor ? "↓ · BACK TO MAP" : near ? "E · TALK TO BLACKSMITH" : ""}
        </p>
      </div>

      {pad.formOpen ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Blacksmith"
          className="absolute inset-0 z-20 overflow-y-auto bg-ink/70"
        >
          <div className="sticky top-0 z-30 flex justify-end bg-[#041833]/90 px-4 py-3">
            <button
              type="button"
              onClick={pad.closeForm}
              className="bg-[#092B61] px-3 py-2 font-pixel text-[16px] leading-none text-white shadow-[3px_3px_0_#041833] transition-transform duration-150 ease-[var(--ease-out-strong)] active:scale-[0.97]"
            >
              CLOSE
            </button>
          </div>
          <div className="mx-auto w-full max-w-xl px-4 pb-6">
            <PixelFactory pad={pad} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
