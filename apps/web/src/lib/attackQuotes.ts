import type { AttackQuote } from "@boss-pool/chain";
import { ATTACK_CAPS, type AttackCap } from "./attackCommand";

export const ATTACK_QUOTE_POLL_MS = 30_000;

/** Warm every command immediately, then refresh without overlapping requests. */
export function pollAttackQuotes(
  request: (cap: AttackCap) => Promise<AttackQuote>,
  onQuote: (cap: AttackCap, quote: AttackQuote, requestedAt: number) => void,
  onError: (cap: AttackCap, error: unknown) => void,
) {
  let stopped = false;
  const pending = new Set<AttackCap>();
  const refresh = () => {
    if (stopped) return;
    for (const cap of ATTACK_CAPS) {
      if (pending.has(cap)) continue;
      pending.add(cap);
      const requestedAt = Date.now();
      void request(cap).then((quote) => {
        if (!stopped) onQuote(cap, quote, requestedAt);
      }).catch((error: unknown) => {
        if (!stopped) onError(cap, error);
      }).finally(() => pending.delete(cap));
    }
  };
  refresh();
  const timer = setInterval(refresh, ATTACK_QUOTE_POLL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
