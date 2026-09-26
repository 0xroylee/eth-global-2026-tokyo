import type { BossId } from "@/game/bosses";

/** A challenge-origin wallet request. HUD connection never creates one. */
export type ChallengeIntent = { bossId: BossId; generation: number };

export type IntentState = {
  generation: number;
  intent: ChallengeIntent | null;
};

export type IntentAction =
  | { type: "request"; bossId: BossId }
  | { type: "cancel" }
  | { type: "hud" }
  | { type: "select"; bossId: BossId | null }
  | { type: "settle"; generation: number };

export type IntentTransition = {
  state: IntentState;
  /** Set only when this exact request is still current. Callers must not open a boss from a null result. */
  restoreBossId: BossId | null;
};

export const idleIntent: IntentState = { generation: 0, intent: null };

export function transitionChallengeIntent(state: IntentState, action: IntentAction): IntentTransition {
  switch (action.type) {
    case "request": {
      const generation = state.generation + 1;
      return { state: { generation, intent: { bossId: action.bossId, generation } }, restoreBossId: null };
    }
    case "cancel":
      return { state: { generation: state.generation + 1, intent: null }, restoreBossId: null };
    case "hud":
      return { state, restoreBossId: null };
    case "select": {
      if (!state.intent || state.intent.bossId === action.bossId) return { state, restoreBossId: null };
      return { state: { generation: state.generation + 1, intent: null }, restoreBossId: null };
    }
    case "settle": {
      if (!state.intent || state.intent.generation !== action.generation) return { state, restoreBossId: null };
      return { state: { generation: state.generation, intent: null }, restoreBossId: state.intent.bossId };
    }
  }
}

/** A settled request may refresh the panel that is already open. It must not reopen a closed one. */
export function bossToRestore(transition: IntentTransition, openBoss: BossId | null): BossId | null {
  if (!transition.restoreBossId || transition.restoreBossId !== openBoss) return null;
  return openBoss;
}
