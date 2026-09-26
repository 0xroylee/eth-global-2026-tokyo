"use client";

import { useCallback, useRef, useState } from "react";
import type { BossId } from "@/game/bosses";
import {
  idleIntent,
  transitionChallengeIntent,
  type IntentAction,
  type IntentTransition,
} from "./challengeWallet";

/** Keeps a challenge wallet request alive across connection, cancellation, and pool changes. */
export function useChallengeWallet() {
  const [state, setState] = useState(idleIntent);
  const stateRef = useRef(state);
  stateRef.current = state;

  const dispatch = useCallback((action: IntentAction): IntentTransition => {
    const next = transitionChallengeIntent(stateRef.current, action);
    stateRef.current = next.state;
    setState(next.state);
    return next;
  }, []);

  const requestChallengeWallet = useCallback((bossId: BossId) => dispatch({ type: "request", bossId }), [dispatch]);
  const cancelChallengeWallet = useCallback(() => dispatch({ type: "cancel" }), [dispatch]);
  const noteHudConnect = useCallback(() => dispatch({ type: "hud" }), [dispatch]);
  const noteSelectedBoss = useCallback((bossId: BossId | null) => dispatch({ type: "select", bossId }), [dispatch]);
  const settle = useCallback((generation: number) => dispatch({ type: "settle", generation }), [dispatch]);

  return {
    intent: state.intent,
    requestChallengeWallet,
    cancelChallengeWallet,
    noteHudConnect,
    noteSelectedBoss,
    settle,
  };
}
