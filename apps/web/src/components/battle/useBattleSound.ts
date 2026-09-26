"use client";

import { useEffect, useRef, useState } from "react";

const PEAK_GAIN = 0.04;
const VOICE_CAP = 8;

export type BattleCue = "charge" | "submit" | "launch" | "impact" | "stage-clear" | "victory";

type Voice = { stop: () => void };

/** Quiet battle cues. The context starts only from the sound control, and playback never throws into the battle. */
export function useBattleSound(identity: string) {
  const audio = useRef<AudioContext | null>(null);
  const enabled = useRef(false);
  const voices = useRef<Voice[]>([]);
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);

  const stop = () => {
    const active = voices.current;
    voices.current = [];
    for (const voice of active) voice.stop();
  };

  const play = (cue: BattleCue) => {
    try {
      const context = audio.current;
      if (!enabled.current || !context || context.state !== "running" || document.hidden) return;
      if (cue === "launch" || cue === "impact") playNoise(context, cue === "impact" ? 0.09 : 0.12);
      const notes = cue === "charge" ? [523.25]
        : cue === "submit" ? [392]
          : cue === "impact" ? [196]
            : cue === "stage-clear" ? [523.25, 783.99]
              : cue === "victory" ? [392, 523.25, 783.99]
                : [659.25];
      notes.forEach((frequency, index) => startTone(context, frequency, context.currentTime + index * 0.07));
    } catch {
      // A failed cue must not affect the wallet action or the battle render.
    }
  };

  const startTone = (context: AudioContext, frequency: number, start: number) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(PEAK_GAIN, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    oscillator.connect(envelope).connect(context.destination);
    const voice: Voice = {
      stop: () => {
        try { oscillator.stop(); } catch { /* already ended */ }
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
    oscillator.stop(start + 0.2);
  };

  const playNoise = (context: AudioContext, duration: number) => {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const envelope = context.createGain();
    source.buffer = buffer;
    const start = context.currentTime;
    envelope.gain.setValueAtTime(PEAK_GAIN, start);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(envelope).connect(context.destination);
    const voice: Voice = {
      stop: () => {
        try { source.stop(); } catch { /* already ended */ }
        source.disconnect();
        envelope.disconnect();
      },
    };
    source.onended = () => {
      source.disconnect();
      envelope.disconnect();
      voices.current = voices.current.filter((entry) => entry !== voice);
    };
    voices.current.push(voice);
    while (voices.current.length > VOICE_CAP) voices.current.shift()?.stop();
    source.start(start);
    source.stop(start + duration);
  };

  useEffect(() => {
    const onHide = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      enabled.current = false;
      stop();
      setOn(false);
      const context = audio.current;
      audio.current = null;
      if (context) void context.close().catch(() => undefined);
    };
  }, [identity]);

  const toggle = async () => {
    try {
      if (enabled.current) {
        enabled.current = false;
        setOn(false);
        setFailed(false);
        stop();
        await audio.current?.suspend();
        return;
      }
      const context = audio.current ?? new AudioContext();
      audio.current = context;
      await context.resume();
      if (context.state !== "running") throw new Error("AudioContext did not start");
      enabled.current = true;
      setOn(true);
      setFailed(false);
    } catch {
      enabled.current = false;
      stop();
      const context = audio.current;
      audio.current = null;
      if (context) void context.close().catch(() => undefined);
      setOn(false);
      setFailed(true);
    }
  };

  return { on, failed, toggle, play, stop };
}
