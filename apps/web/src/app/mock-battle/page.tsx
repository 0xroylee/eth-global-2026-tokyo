"use client";

import { BattleView } from "@/components/battle/BattleView";
import { useMockBattle } from "@/lib/useMockBattle";

/** Direct preview of the mock arena, without the Phaser hub (spec §2.6). */
export default function MockBattlePage() {
  const battle = useMockBattle();
  return (
    <BattleView
      state={battle.state}
      phase={battle.phase}
      deadlineAt={battle.deadlineAt}
      onAttack={battle.attack}
      onClose={() => window.location.assign("/")}
    />
  );
}
