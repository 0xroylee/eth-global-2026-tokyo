"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import {
  ATTACK_PHASE_MS,
  createInitialMockBattleState,
  HIT_SETTLE_MS,
  MOCK_DEADLINE_MS,
  mockBattleReducer,
  STAGE_CLEARED_MS,
  STAGE_CLEARED_REDUCED_MS,
  type AttackPhase,
  type MockBattleState,
} from "./mockBattle";

export type MockBattleController = {
  state: MockBattleState;
  phase: AttackPhase;
  /** Demo deadline: hook mount + 2h. Real chain has no deadline field yet (spec §8). */
  deadlineAt: number;
  canAttack: boolean;
  attack: () => void;
};

/**
 * Drives the deterministic reducer with fixed-delay timers. Every timer is
 * cleaned up (StrictMode double-mount safe) and the reducer is idempotent,
 * so replay is always deterministic.
 */
export function useMockBattle(): MockBattleController {
  const [state, dispatch] = useReducer(mockBattleReducer, undefined, createInitialMockBattleState);
  const [phase, setPhase] = useState<AttackPhase>("idle");
  const [deadlineAt] = useState(() => Date.now() + MOCK_DEADLINE_MS);

  // Phase stepping: simulate → sign → submit → confirmed, fixed delays.
  useEffect(() => {
    if (phase === "idle" || phase === "confirmed") return;
    const timer = window.setTimeout(() => {
      if (phase === "simulate") {
        setPhase("sign");
      } else if (phase === "sign") {
        setPhase("submit");
      } else {
        setPhase("confirmed");
        dispatch({ type: "advance-phase", phase: "confirmed" });
      }
    }, ATTACK_PHASE_MS[phase]);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Confirmed tail: hold 400ms so the HIT CONFIRMED line reads, then unlock.
  // Victory keeps the phase on "confirmed"; the panel is replaced anyway.
  useEffect(() => {
    if (phase !== "confirmed" || state.status === 3) return;
    const timer = window.setTimeout(() => setPhase("idle"), ATTACK_PHASE_MS.confirmed);
    return () => window.clearTimeout(timer);
  }, [phase, state.status]);

  // Hit nudge settles back to idle after 240ms.
  useEffect(() => {
    if (state.bossState !== "hit") return;
    const timer = window.setTimeout(() => dispatch({ type: "settle-hit" }), HIT_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [state.bossState]);

  // STAGE CLEARED transition: 600ms, or 100ms under reduced motion.
  useEffect(() => {
    if (state.status !== 2) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      () => dispatch({ type: "settle-transition" }),
      reduced ? STAGE_CLEARED_REDUCED_MS : STAGE_CLEARED_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.status]);

  const canAttack = phase === "idle" && state.status === 1 && !state.victory;

  const attack = useCallback(() => {
    if (phase !== "idle" || state.status !== 1 || state.victory) return;
    setPhase("simulate");
  }, [phase, state.status, state.victory]);

  return { state, phase, deadlineAt, canAttack, attack };
}
