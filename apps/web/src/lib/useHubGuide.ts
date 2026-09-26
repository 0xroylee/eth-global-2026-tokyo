"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BossId } from "@/game/bosses";
import type { GameBridge } from "@/game/bridge";
import { guideSceneStep, HUB_GUIDE_STORAGE_KEY, transitionGuide, type GuideState } from "./hubGuide";

const HIDDEN: GuideState = { step: "hidden", nearBoss: null };

function readStoredGuide(): "complete" | "skipped" | null {
  try {
    const value = localStorage.getItem(HUB_GUIDE_STORAGE_KEY);
    return value === "complete" || value === "skipped" ? value : null;
  } catch {
    return null;
  }
}

function writeStoredGuide(value: "complete" | "skipped") {
  try {
    localStorage.setItem(HUB_GUIDE_STORAGE_KEY, value);
  } catch {
    // Storage can be blocked. The in-memory guide still runs.
  }
}

function clearStoredGuide() {
  try {
    localStorage.removeItem(HUB_GUIDE_STORAGE_KEY);
  } catch {
    // Replay still resets the in-memory guide.
  }
}

export function useHubGuide(bridge: GameBridge, nearBoss: BossId | null) {
  const [state, setState] = useState<GuideState>(HIDDEN);
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  const nearRef = useRef(nearBoss);
  const modalRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    nearRef.current = nearBoss;
  }, [nearBoss]);

  useEffect(() => {
    const stored = readStoredGuide();
    setState(stored ? HIDDEN : { step: "welcome", nearBoss: null });
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setState((current) => transitionGuide(current, { type: "near", bossId: nearBoss }));
  }, [hydrated, nearBoss]);

  useEffect(() => {
    if (!hydrated || state.step !== "done") return;
    writeStoredGuide("complete");
  }, [hydrated, state.step]);

  const publish = useCallback(
    (next: GuideState, modalOpen: boolean) => {
      bridge.send("guide:step", { step: guideSceneStep(next.step) });
      bridge.send("ui:modal", { open: modalOpen });
    },
    [bridge],
  );

  useEffect(() => {
    const offMoved = bridge.on("guide:moved", () => {
      setState((current) => transitionGuide(current, { type: "moved" }));
    });
    const offReady = bridge.on("scene:ready", () => {
      publish(stateRef.current, modalRef.current);
    });
    return () => {
      offMoved();
      offReady();
    };
  }, [bridge, publish]);

  useEffect(() => {
    if (!hydrated) return;
    bridge.send("guide:step", { step: guideSceneStep(state.step) });
  }, [bridge, hydrated, state.step]);

  const syncModal = useCallback((open: boolean) => {
    modalRef.current = open;
  }, []);

  const start = useCallback(() => {
    setState((current) => transitionGuide(current, { type: "start" }));
  }, []);

  const skip = useCallback(() => {
    writeStoredGuide("skipped");
    setState((current) => transitionGuide(current, { type: "skip" }));
  }, []);

  const replay = useCallback(() => {
    clearStoredGuide();
    setState((current) => {
      const restarted = transitionGuide(current, { type: "replay" });
      return transitionGuide(restarted, { type: "near", bossId: nearRef.current });
    });
  }, []);

  const dismiss = useCallback(() => {
    setState((current) => transitionGuide(current, { type: "dismiss" }));
  }, []);

  const panelOpened = useCallback((bossId: BossId) => {
    setState((current) => transitionGuide(current, { type: "opened", bossId }));
  }, []);

  return { state, hydrated, start, skip, replay, dismiss, panelOpened, syncModal };
}
