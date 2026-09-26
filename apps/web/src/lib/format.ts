import { formatUnits } from "@boss-pool/chain";

/** Human-readable token amount with trailing zeros trimmed. */
export function displayAmount(value: bigint, decimals: number): string {
  return formatUnits(value, decimals)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

export const ROUND_STATUSES = ["Setup", "Active", "Stage cleared", "Defeated", "Expired"] as const;

export function roundStatusLabel(status: number): string {
  return ROUND_STATUSES[status] ?? `Status ${status}`;
}
