import type { EIP1193Provider } from "@boss-pool/chain";
import type { DiscoveredWallet } from "./types";

const SAFE_ICON = /^data:image\/(?:png|jpeg|webp|svg\+xml)[;,]/i;

function nonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isProvider(value: unknown): value is EIP1193Provider {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["request", "on", "removeListener"].every((key) => typeof candidate[key] === "function");
}

/** Validates an `eip6963:announceProvider` detail. Returns null instead of trusting a malformed announcement. */
export function normalizeProviderDetail(value: unknown): DiscoveredWallet | null {
  if (!value || typeof value !== "object") return null;
  const { info, provider } = value as { info?: unknown; provider?: unknown };
  if (!info || typeof info !== "object" || !isProvider(provider)) return null;
  const { uuid, name, icon, rdns } = info as Record<string, unknown>;
  if (!nonBlankString(uuid) || !nonBlankString(name) || !nonBlankString(rdns)) return null;
  const iconText = typeof icon === "string" ? icon : "";
  return {
    info: { uuid: uuid.trim(), name: name.trim(), icon: iconText, rdns: rdns.trim() },
    provider,
    safeIcon: SAFE_ICON.test(iconText) ? iconText : null,
  };
}

/** Appends in first-seen order; a repeated uuid replaces the earlier entry in place. */
export function appendProvider(list: readonly DiscoveredWallet[], wallet: DiscoveredWallet): DiscoveredWallet[] {
  const index = list.findIndex((entry) => entry.info.uuid === wallet.info.uuid);
  if (index === -1) return [...list, wallet];
  return list.map((entry, i) => (i === index ? wallet : entry));
}

/** Wraps a bare `window.ethereum` for wallets that predate EIP-6963. */
export function legacyProviderDetail(provider: EIP1193Provider): DiscoveredWallet {
  return {
    info: { uuid: "legacy-window-ethereum", name: "Browser Wallet", icon: "", rdns: "legacy.injected" },
    provider,
    safeIcon: null,
  };
}
