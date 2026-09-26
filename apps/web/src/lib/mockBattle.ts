/**
 * Deterministic, chain-free battle mock: constants, types and a pure reducer.
 * No React here — `useMockBattle` drives it with timers.
 *
 * Swap path (spec §8): the state shape mirrors `LocalRoundSnapshot`
 * (packages/chain/src/index.ts), so `useLocalRound()` plus a future write
 * path can replace this file without touching any battle component.
 */

export type AttackPhase = "idle" | "simulate" | "sign" | "submit" | "confirmed";

/** Visual state of the boss art. */
export type BossVisualState = "idle" | "hit" | "transition" | "defeated";

/** Boss HP uses 18 decimals (delivery-plan.md). */
export const HP_DECIMALS = 18;

/** Mock stage capacities: 300 / 600 / 900 HP (docs/delivery-plan.md:11). */
export const MOCK_STAGE_CAPACITY: readonly [bigint, bigint, bigint] = [
  300n * 10n ** 18n,
  600n * 10n ** 18n,
  900n * 10n ** 18n,
];

/** Exactly 5 hits clear each stage: 300/60 = 600/120 = 900/180 = 5. */
export const MOCK_STAGE_DAMAGE: readonly [bigint, bigint, bigint] = [
  60n * 10n ** 18n,
  120n * 10n ** 18n,
  180n * 10n ** 18n,
];

/** 1,000 MockUSD × 1e6 (docs/delivery-plan.md:47). */
export const MOCK_PRIZE = 1_000_000_000n;

/** Mock finalEligibleHP when a single player clears all three stages. */
export const MOCK_FINAL_ELIGIBLE_HP = 1800n * 10n ** 18n;

/** Fixed attack phase delays (ms): 1.6s total, within the 1.2–2.4s window. */
export const ATTACK_PHASE_MS: Record<Exclude<AttackPhase, "idle">, number> = {
  simulate: 400,
  sign: 400,
  submit: 400,
  confirmed: 400,
};

/** Hit nudge settles back to idle after 240ms. */
export const HIT_SETTLE_MS = 240;

/** STAGE CLEARED transition overlay duration (ms); reduced-motion variant. */
export const STAGE_CLEARED_MS = 600;
export const STAGE_CLEARED_REDUCED_MS = 100;

/** Stage accent hues: stage-1/2/3 (art direction §4.1; not repo tokens). */
export const STAGE_HUES: readonly [string, string, string] = ["#95a7f6", "#b685ff", "#f08cff"];

/** Demo deadline: mount time + 2h (delivery-plan.md candidate demo config). */
export const MOCK_DEADLINE_MS = 2 * 60 * 60 * 1000;

/** State shape aligned with `LocalRoundSnapshot` (chain/src/index.ts). */
export type MockBattleState = {
  /** ROUND_STATUSES index (format.ts): 1 Active / 2 Stage cleared / 3 Defeated */
  status: number;
  /** 0-based */
  currentStage: number;
  stageSold: [bigint, bigint, bigint];
  stageCapacity: [bigint, bigint, bigint];
  originalPrize: bigint;
  finalEligibleHP: bigint;
  victory: boolean;
  bossState: BossVisualState;
};

export function createInitialMockBattleState(): MockBattleState {
  return {
    status: 1,
    currentStage: 0,
    stageSold: [0n, 0n, 0n],
    stageCapacity: [...MOCK_STAGE_CAPACITY],
    originalPrize: MOCK_PRIZE,
    finalEligibleHP: 0n,
    victory: false,
    bossState: "idle",
  };
}

export type MockBattleAction =
  | { type: "advance-phase"; phase: Exclude<AttackPhase, "idle"> }
  | { type: "settle-hit" }
  | { type: "settle-transition" };

/**
 * Pure and deterministic: damage is applied exactly once, when the confirmed
 * phase is entered; later dispatches are no-ops for the settled states.
 */
export function mockBattleReducer(state: MockBattleState, action: MockBattleAction): MockBattleState {
  switch (action.type) {
    case "advance-phase": {
      if (action.phase !== "confirmed") return state;
      if (state.status !== 1 || state.victory) return state;
      const stage = state.currentStage;
      const stageSold: [bigint, bigint, bigint] = [state.stageSold[0], state.stageSold[1], state.stageSold[2]];
      stageSold[stage] += MOCK_STAGE_DAMAGE[stage];
      if (stageSold[stage] > state.stageCapacity[stage]) stageSold[stage] = state.stageCapacity[stage];
      if (stageSold[stage] === state.stageCapacity[stage]) {
        if (stage < 2) {
          return { ...state, stageSold, status: 2, bossState: "transition" };
        }
        return {
          ...state,
          stageSold,
          status: 3,
          victory: true,
          finalEligibleHP: MOCK_FINAL_ELIGIBLE_HP,
          bossState: "defeated",
        };
      }
      return { ...state, stageSold, bossState: "hit" };
    }
    case "settle-hit":
      return state.bossState === "hit" ? { ...state, bossState: "idle" } : state;
    case "settle-transition":
      if (state.status !== 2) return state;
      return {
        ...state,
        status: 1,
        currentStage: Math.min(state.currentStage + 1, 2),
        bossState: "idle",
      };
  }
}

/** HP left in the current stage. */
export function remainingInStage(state: MockBattleState): bigint {
  const cap = state.stageCapacity[state.currentStage];
  const sold = state.stageSold[state.currentStage];
  return cap > sold ? cap - sold : 0n;
}

/** Floor share of the prize: `prize * eligibleHP / finalEligibleHP` (6 decimals). */
export function mockRewardShare(eligibleHP: bigint, finalEligibleHP: bigint, prize: bigint): bigint {
  if (finalEligibleHP <= 0n) return 0n;
  return (prize * eligibleHP) / finalEligibleHP;
}
