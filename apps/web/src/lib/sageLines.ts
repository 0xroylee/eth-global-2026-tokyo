import { BOSSES } from "../game/bosses";

/** Set once the player has closed the sage dialog; absent means a first visit. */
export const SAGE_TALKED_STORAGE_KEY = "boss-pool:sage-talked:v1";
/** Set once Roy has really been defeated on chain. Written by the round state owner. */
export const SAGE_DEFEATED_STORAGE_KEY = "boss-pool:defeated:v1";

export type SageState = {
  /** The player has never closed the sage dialog. */
  firstVisit: boolean;
  /** The default Roy encounter is defeated. */
  defeated: boolean;
};

/** Roster gates: the Launch Boost challengers the sage counts. */
function challengerCount(): number {
  return BOSSES.filter((boss) => boss.rosterMeta !== undefined).length;
}

/**
 * The sage's script as a pure function, mirroring `transitionGuide`.
 *
 * A first visit wins over a defeat so a fresh player always hears the
 * introduction. Counts come from `BOSSES`, not from the prose, so the roster
 * and the lines cannot drift apart.
 */
export function sageLines(state: SageState): string[] {
  const challengers = challengerCount();
  if (state.firstVisit) {
    return [
      `Young one, welcome to the Boss BoostPad garden. ${challengers} challengers from Base are waiting ahead, and they will take everyone's sweetest dreams.`,
      "Roy and Macro Whale have awakened. Choose either gate to begin your battle.",
    ];
  }
  if (state.defeated) {
    return [
      `You bested Roy. Macro Whale has its own pool and prize. The other ${BOSSES.filter((boss) => boss.source !== "chain").length} gates are still waiting for their contracts.`,
    ];
  }
  return [
    `Roy and Macro Whale are ready to fight. Those ${challengers} shadows share one face until their pools arrive.`,
  ];
}
