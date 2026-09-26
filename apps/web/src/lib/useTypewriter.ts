"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

/** Base delay before each character is revealed. */
export const TYPE_CHAR_MS = 28;
/** Extra pause after a soft break (comma, ideographic comma, semicolon). */
export const TYPE_SOFT_PAUSE_MS = 200;
/** Extra pause after a sentence ends. */
export const TYPE_HARD_PAUSE_MS = 400;

const SOFT_BREAKS = new Set([",", "，", "、", ";", "；", "—"]);
const HARD_BREAKS = new Set([".", "。", "!", "！", "?", "？", "…"]);

function pauseAfter(character: string): number {
  if (HARD_BREAKS.has(character)) return TYPE_HARD_PAUSE_MS;
  if (SOFT_BREAKS.has(character)) return TYPE_SOFT_PAUSE_MS;
  return 0;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * Reveals `text` one character at a time, pausing on punctuation.
 *
 * `complete()` fills the rest of the line, which lets a caller run the usual
 * two-step skip: the first key press finishes the line, the next one advances.
 * Reduced motion skips the animation entirely and shows the whole line.
 */
export function useTypewriter(text: string) {
  const reduceMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
  const characters = useMemo(() => [...text], [text]);
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(reduceMotion ? characters.length : 0);
  }, [characters, reduceMotion]);

  useEffect(() => {
    if (reduceMotion || count >= characters.length) return;
    const previous = count > 0 ? characters[count - 1] ?? "" : "";
    const timer = window.setTimeout(() => {
      setCount((current) => Math.min(current + 1, characters.length));
    }, TYPE_CHAR_MS + pauseAfter(previous));
    return () => window.clearTimeout(timer);
  }, [characters, count, reduceMotion]);

  const complete = useCallback(() => setCount(characters.length), [characters.length]);

  return {
    shown: characters.slice(0, count).join(""),
    done: count >= characters.length,
    complete,
  };
}
