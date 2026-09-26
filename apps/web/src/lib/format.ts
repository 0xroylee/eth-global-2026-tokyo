import { formatUnits } from "@boss-pool/chain";

/** Human-readable token amount with trailing zeros trimmed. */
export function displayAmount(value: bigint, decimals: number): string {
  return formatUnits(value, decimals)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

export function displayEstimate(value: bigint, decimals: number, fractionDigits = 4): string {
  const places = Math.min(decimals, fractionDigits);
  const factor = 10n ** BigInt(decimals - places);
  return displayAmount((value + factor / 2n) / factor, places);
}

export const ROUND_STATUSES = ["Setup", "Active", "Stage cleared", "Defeated", "Expired"] as const;

export function roundStatusLabel(status: number): string {
  return ROUND_STATUSES[status] ?? `Status ${status}`;
}
