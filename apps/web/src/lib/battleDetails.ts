import type { RoundSnapshot } from "@boss-pool/chain";

export function battleProgress(round: RoundSnapshot) {
  const factory = round.encounterMode === "factory";
  const targets = factory ? round.stageVolumeTarget : round.stageCapacity;
  const amounts = factory ? round.stageVolume : round.stageSold;
  const stages = targets.map((target, index) => {
    const cleared = round.status === 3 || index < round.currentStage || (round.status === 2 && index === round.currentStage);
    const unlocked = round.status !== 0 && index <= round.currentStage;
    const completed = cleared ? target : !unlocked ? 0n : amounts[index] > target ? target : amounts[index];
    return { target, amount: amounts[index], cleared, unlocked, completed, percent: progressPercent(completed, target) };
  });
  const total = targets.reduce((sum, target) => sum + target, 0n);
  const completed = stages.reduce((sum, stage) => sum + stage.completed, 0n);
  return { stages, percent: progressPercent(completed, total) };
}

function progressPercent(amount: bigint, target: bigint) {
  return target > 0n ? Number(amount * 10_000n / target) / 100 : 0;
}
