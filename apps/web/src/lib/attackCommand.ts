export type AttackCommandRoute = "attack" | "approval" | "wait";

export function routeAttackCommand({
  quoteFresh,
  attackReady,
  allowanceMissing,
  approvalReady,
}: {
  quoteFresh: boolean;
  attackReady: boolean;
  allowanceMissing: boolean;
  approvalReady: boolean;
}): AttackCommandRoute {
  if (!quoteFresh) return "wait";
  if (attackReady) return "attack";
  if (allowanceMissing && approvalReady) return "approval";
  return "wait";
}
