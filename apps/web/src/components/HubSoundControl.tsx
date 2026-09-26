"use client";

import { useEffect, useRef, useState } from "react";
import type { GameBridge } from "@/game/bridge";
import { HubMusic } from "@/game/HubMusic";

const PEAK_GAIN = 0.045;
const ATTACK_S = 0.012;
const RELEASE_S = 0.25;
const VOICE_CAP = 8;
const DISCOVERY_COOLDOWN_MS = 600;

type Voice = { stop: () => void };

/** Hand the keyboard back to the map after a sound or music click. */
function focusMap(control: HTMLElement) {
  const canvas = control.closest("section")?.querySelector("canvas");
  if (!(canvas instanceof HTMLCanvasElement)) {
    control.blur();
    return;
  }
  canvas.tabIndex = -1;
  canvas.focus();
}

/** Quiet synthesized cues. Playback starts only after the sound button's click. */
export function HubSoundControl({ bridge }: { bridge: GameBridge }) {
  const audio = useRef<AudioContext | null>(null);
  const enabled = useRef(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  const op = useRef(0);
  const voices = useRef<Voice[]>([]);
  const lastDiscovery = useRef(0);
  const muting = useRef(false);
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);
  const music = useRef<HubMusic | null>(null);
  const [musicOn, setMusicOn] = useState(false);

  const stopMusic = () => {
    music.current?.stop();
    music.current = null;
  };

  const stopAll = () => {
    const active = voices.current;
    voices.current = [];
    for (const voice of active) voice.stop();
  };

  const play = (notes: number[], discovery = false) => {
    const context = audio.current;
    if (!enabled.current || !context || context.state !== "running" || document.hidden) return;
    const nowMs = performance.now();
    if (discovery) {
      if (nowMs - lastDiscovery.current < DISCOVERY_COOLDOWN_MS) return;
      lastDiscovery.current = nowMs;
    }
    notes.forEach((frequency, index) => {
      const start = context.currentTime + index * 0.075;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.frequency.setValueAtTime(frequency, start);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(PEAK_GAIN, start + ATTACK_S);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + RELEASE_S);
      oscillator.connect(envelope).connect(context.destination);
      const voice: Voice = {
        stop: () => {
          try {
            oscillator.stop();
          } catch {
            // Already stopped by its scheduled end.
          }
          oscillator.disconnect();
          envelope.disconnect();
        },
      };
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
        voices.current = voices.current.filter((entry) => entry !== voice);
      };
      voices.current.push(voice);
      while (voices.current.length > VOICE_CAP) voices.current.shift()?.stop();
      oscillator.start(start);
      oscillator.stop(start + RELEASE_S + 0.01);
    });
  };

  useEffect(() => {
    mounted.current = true;
    const offNear = bridge.on("gate:near", ({ bossId }) => {
      if (!bossId) return;
      play(bossId === "locked" ? [196] : [523.25, 659.25], true);
    });
    const offEnter = bridge.on("gate:enter", ({ bossId }) => {
      play(bossId === "locked" ? [196, 164.81] : [392, 523.25, 783.99]);
    });
    const onHide = () => {
      if (document.hidden) {
        stopAll();
        stopMusic();
        setMusicOn(false);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      mounted.current = false;
      op.current += 1;
      offNear();
      offEnter();
      document.removeEventListener("visibilitychange", onHide);
      enabled.current = false;
      stopMusic();
      stopAll();
      const context = audio.current;
      audio.current = null;
      if (context) void context.close().catch(() => {});
    };
  }, [bridge]);

  const toggle = async () => {
    if (busy.current) return;
    busy.current = true;
    const request = ++op.current;
    try {
      if (enabled.current) {
        muting.current = true;
        enabled.current = false;
        setOn(false);
        setFailed(false);
        stopAll();
        stopMusic();
        setMusicOn(false);
        await audio.current?.suspend();
        muting.current = false;
        return;
      }
      const context = audio.current ?? new AudioContext();
      if (!audio.current) {
        audio.current = context;
        context.onstatechange = () => {
          if (muting.current || !enabled.current || context.state === "running") return;
          if (audio.current !== context) return;
          enabled.current = false;
          stopAll();
          stopMusic();
          if (!mounted.current) return;
          setOn(false);
          setMusicOn(false);
          setFailed(true);
        };
      }
      await context.resume();
      if (!mounted.current || request !== op.current || audio.current !== context) return;
      if (context.state !== "running") throw new Error("AudioContext did not start");
      enabled.current = true;
      setOn(true);
      setFailed(false);
      play([523.25, 783.99]);
    } catch {
      enabled.current = false;
      stopAll();
      stopMusic();
      const context = audio.current;
      audio.current = null;
      if (context) void context.close().catch(() => {});
      if (!mounted.current) return;
      setOn(false);
      setMusicOn(false);
      setFailed(true);
    } finally {
      busy.current = false;
    }
  };

  const status = failed ? "Sound unavailable. Try again." : on ? "Map sound on" : "Map sound off";

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={failed ? "Sound unavailable. Retry enabling sound" : "Map sound effects"}
        aria-pressed={on}
        onClick={(event) => {
          void toggle();
          focusMap(event.currentTarget);
        }}
        className="inline-flex min-h-9 items-center rounded-md border border-white/20 bg-ink/85 px-2.5 font-mono text-[9px] tracking-[0.12em] text-fog transition-colors hover:bg-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {failed ? "SOUND · RETRY" : `SOUND · ${on ? "ON" : "OFF"}`}
      </button>
      <button
        type="button"
        aria-label="Background music"
        aria-pressed={musicOn}
        disabled={!on}
        title={on ? "Quiet garden melody" : "Enable sound first"}
        onClick={(event) => {
          if (music.current) {
            stopMusic();
            setMusicOn(false);
          } else if (audio.current?.state === "running" && enabled.current) {
            music.current = new HubMusic(audio.current);
            music.current.start();
            setMusicOn(true);
          }
          focusMap(event.currentTarget);
        }}
        className="inline-flex min-h-9 items-center rounded-md border border-white/20 bg-ink/85 px-2.5 font-mono text-[9px] tracking-[0.12em] text-fog disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        MUSIC · {musicOn ? "ON" : "OFF"}
      </button>
      <span role="status" className={`font-mono text-[9px] tracking-[0.08em] text-[#f5b04a] ${failed ? "" : "sr-only"}`}>
        {status}
      </span>
    </div>
  );
}
