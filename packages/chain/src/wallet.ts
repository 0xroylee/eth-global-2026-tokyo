import {
  createWalletClient,
  custom,
  getAddress,
  isAddress,
  type Address,
  type EIP1193Provider,
} from "viem";
import { baseSepolia } from "viem/chains";

/** The only remote wallet target in this slice. Derived from viem, not hand-maintained. */
export const BASE_SEPOLIA_CHAIN = baseSepolia;
export const BASE_SEPOLIA_CHAIN_HEX = `0x${baseSepolia.id.toString(16)}` as const;

const HEX_CHAIN_ID = /^0x[0-9a-f]+$/i;

/** Parses an EIP-1193 `eth_chainId`/`chainChanged` value. Hexadecimal only. */
export function parseWalletChainId(value: unknown): number | null {
  if (typeof value !== "string" || !HEX_CHAIN_ID.test(value)) return null;
  const id = Number.parseInt(value, 16);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Parses an `eth_accounts`/`eth_requestAccounts`/`accountsChanged` response. Any invalid member rejects the whole response. */
export function parseWalletAccounts(value: unknown): Address[] {
  if (!Array.isArray(value)) return [];
  if (!value.every((entry): entry is string => typeof entry === "string" && isAddress(entry, { strict: false }))) return [];
  return value.map((entry) => getAddress(entry));
}

export function providerErrorCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "number" ? code : null;
}

export function walletErrorMessage(error: unknown): string {
  switch (providerErrorCode(error)) {
    case 4001:
      return "Request rejected in wallet.";
    case 4900:
    case 4901:
      return "Wallet disconnected.";
    default:
      return "Wallet request failed. Try again.";
  }
}

/** Switches the provider to Base Sepolia, adding the chain first when the wallet does not know it (4902). */
export async function switchToBaseSepolia(provider: EIP1193Provider): Promise<void> {
  const switchChain = () =>
    provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA_CHAIN_HEX }] });
  try {
    await switchChain();
  } catch (error) {
    if (providerErrorCode(error) !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BASE_SEPOLIA_CHAIN_HEX,
          chainName: baseSepolia.name,
          nativeCurrency: baseSepolia.nativeCurrency,
          rpcUrls: [...baseSepolia.rpcUrls.default.http],
          blockExplorerUrls: baseSepolia.blockExplorers ? [baseSepolia.blockExplorers.default.url] : undefined,
        },
      ],
    });
    await switchChain();
  }
}

export function createBaseSepoliaWalletClient(provider: EIP1193Provider, account?: Address) {
  return createWalletClient({ chain: baseSepolia, account, transport: custom(provider) });
}
