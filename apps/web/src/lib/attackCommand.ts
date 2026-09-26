export type AttackCommandRoute = "attack" | "approval" | "wait";
export const ATTACK_CAPS = [1, 5, 10] as const;
export type AttackCap = typeof ATTACK_CAPS[number];

export function attackCapAmount(cap: AttackCap): bigint {
  return BigInt(cap) * 1_000_000n;
}

export function routeAttackCommand({
  quoteFresh,
  quoteMaxMockUSD,
  selectedMaxMockUSD,
  attackReady,
  allowanceMissing,
  approvalReady,
}: {
  quoteFresh: boolean;
  quoteMaxMockUSD: bigint | null;
  selectedMaxMockUSD: bigint;
  attackReady: boolean;
  allowanceMissing: boolean;
  approvalReady: boolean;
}): AttackCommandRoute {
  if (!quoteFresh || quoteMaxMockUSD !== selectedMaxMockUSD) return "wait";
  if (attackReady) return "attack";
  if (allowanceMissing && approvalReady) return "approval";
  return "wait";
}
