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
      `年輕人，歡迎來到 Boss Pool 花園。前方有 ${challengers} 位從 Robinhood 來的挑戰者，他們會奪走每個人的好夢。`,
      "沿著石路向上，一座神社就是一位 Boss。只有 Roy 已經甦醒——先去找祂練手吧。",
    ];
  }
  if (state.defeated) {
    return [
      `你擊敗了 Roy。剩下的 ${BOSSES.length - 1} 位還在等他們的合約降臨。名單之後還會換，改天再來看看吧。`,
    ];
  }
  return [
    `還是那 ${challengers} 位。名單會變，就像城裡的流言。記住那隻叫 ROO 的——只有牠不守規矩，會在路上遊蕩。`,
  ];
}
