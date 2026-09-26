import { expect, test } from "bun:test";
import { hubStageProgress } from "./bridge";

const standaloneRound = {
  encounterMode: "standalone" as const,
  stageSold: [10n, 20n, 30n] as const,
  stageCapacity: [100n, 200n, 300n] as const,
  stageVolume: [1n, 2n, 3n] as const,
  stageVolumeTarget: [10n, 20n, 30n] as const,
};

const factoryRound = { ...standaloneRound, encounterMode: "factory" as const };

test("hub stage gauge uses HP progress for standalone rounds and volume for Factory rounds", () => {
  expect(hubStageProgress(standaloneRound)).toEqual({
    stageProgress: standaloneRound.stageSold,
    stageTarget: standaloneRound.stageCapacity,
  });
  expect(hubStageProgress(factoryRound)).toEqual({
    stageProgress: factoryRound.stageVolume,
    stageTarget: factoryRound.stageVolumeTarget,
  });
});
