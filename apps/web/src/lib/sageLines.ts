import { BOSSES } from "@/game/bosses";

/** Set once the player has closed the sage dialog; absent means a first visit. */
export const SAGE_TALKED_STORAGE_KEY = "boss-pool:sage-talked:v1";
/** Set once Roy has really been defeated on chain. Written by the round state owner. */
export const SAGE_DEFEATED_STORAGE_KEY = "boss-pool:defeated:v1";

export type SageState = {
  /** The player has never closed the sage dialog. */
  firstVisit: boolean;
  /** Roy, the only gate with a contract, is defeated. */
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
      "Follow the stone road north. Only Roy has awakened so far. Go cross blades with him first.",
    ];
  }
  if (state.defeated) {
    return [
      `You bested Roy. The other ${BOSSES.length - 1} are still waiting for their contracts to come down. The roster changes again, so visit another day.`,
    ];
  }
  return [
    `Still those ${challengers} shadows. They share one face until a real pool arrives.`,
  ];
}
