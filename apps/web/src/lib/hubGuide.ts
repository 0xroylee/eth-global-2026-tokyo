import { findBoss, type BossId } from "../game/bosses";
import type { GuideSceneStep } from "../game/bridge";

export const HUB_GUIDE_STORAGE_KEY = "boss-pool:hub-guide:v1";

export type GuideStep = "welcome" | "move" | "find" | "inspect" | "done" | "hidden";

export type GuideState = {
  step: GuideStep;
  nearBoss: BossId | null;
};

export type GuideAction =
  | { type: "start" }
  | { type: "moved" }
  | { type: "near"; bossId: BossId | null }
  | { type: "opened"; bossId: BossId }
  | { type: "skip" }
  | { type: "replay" }
  | { type: "dismiss" };

function isUnlocked(bossId: BossId | null): bossId is BossId {
  return bossId !== null && !findBoss(bossId).locked;
}

/** Pure guide progression. Callers own storage and the Phaser scene. */
export function transitionGuide(state: GuideState, action: GuideAction): GuideState {
  if (action.type === "skip") return { step: "hidden", nearBoss: state.nearBoss };
  if (action.type === "replay") return { step: "welcome", nearBoss: null };
  if (action.type === "dismiss") {
    return state.step === "done" ? { step: "hidden", nearBoss: state.nearBoss } : state;
  }

  if (action.type === "near") {
    const nearBoss = action.bossId;
    if (state.step === "find" && isUnlocked(nearBoss)) return { step: "inspect", nearBoss };
    if (state.step === "inspect" && !isUnlocked(nearBoss)) return { step: "find", nearBoss };
    return { ...state, nearBoss };
  }

  if (action.type === "start") {
    return state.step === "welcome" ? { ...state, step: "move" } : state;
  }

  if (action.type === "moved") {
    if (state.step !== "move") return state;
    return isUnlocked(state.nearBoss)
      ? { step: "inspect", nearBoss: state.nearBoss }
      : { step: "find", nearBoss: state.nearBoss };
  }

  if (state.step === "inspect" && isUnlocked(action.bossId) && action.bossId === state.nearBoss) {
    return { step: "done", nearBoss: state.nearBoss };
  }
  return state;
}

export function guideSceneStep(step: GuideStep): GuideSceneStep {
  if (step === "move" || step === "find" || step === "inspect") return step;
  return "off";
}
