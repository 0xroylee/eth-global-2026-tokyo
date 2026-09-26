export type AttackCommandRoute = "attack" | "approval" | "wait";
export const ATTACK_CAPS = [1, 5, 10] as const;
export type AttackCap = typeof ATTACK_CAPS[number];

export function attackCapAmount(cap: AttackCap): bigint {
  return BigInt(cap) * 1_000_000n;
}

export function quoteMatchesAttackCap(quote: { maxMockUSD: bigint; requestedMaxMockUSD?: bigint } | null | undefined, cap: AttackCap): boolean {
  const selected = attackCapAmount(cap);
  return Boolean(quote && (quote.requestedMaxMockUSD ?? quote.maxMockUSD) === selected && quote.maxMockUSD > 0n && quote.maxMockUSD <= selected);
}

export function attackQuoteFunding(quote: { maxMockUSD: bigint } | undefined, balance?: bigint, allowance?: bigint) {
  return quote ? { required: quote.maxMockUSD, funded: balance !== undefined && balance >= quote.maxMockUSD, needsApproval: allowance !== undefined && allowance < quote.maxMockUSD } : undefined;
}

export function routeAttackCommand({
  quoteFresh,
  quoteMaxMockUSD,
  quoteRequestedMaxMockUSD,
  selectedMaxMockUSD,
  attackReady,
  allowanceMissing,
  approvalReady,
}: {
  quoteFresh: boolean;
  quoteMaxMockUSD: bigint | null;
  quoteRequestedMaxMockUSD?: bigint;
  selectedMaxMockUSD: bigint;
  attackReady: boolean;
  allowanceMissing: boolean;
  approvalReady: boolean;
}): AttackCommandRoute {
  if (!quoteFresh || (quoteRequestedMaxMockUSD ?? quoteMaxMockUSD) !== selectedMaxMockUSD || quoteMaxMockUSD === null || quoteMaxMockUSD <= 0n || quoteMaxMockUSD > selectedMaxMockUSD) return "wait";
  if (attackReady) return "attack";
  if (allowanceMissing && approvalReady) return "approval";
  return "wait";
}
