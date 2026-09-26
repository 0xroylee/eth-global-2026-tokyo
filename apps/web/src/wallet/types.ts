import type { Address, EIP1193Provider } from "@boss-pool/chain";

export type Eip6963ProviderInfo = { uuid: string; name: string; icon: string; rdns: string };
export type Eip6963ProviderDetail = { info: Eip6963ProviderInfo; provider: EIP1193Provider };
/** A validated provider announcement. `safeIcon` is null unless the icon is an allowed image data URI. */
export type DiscoveredWallet = Eip6963ProviderDetail & { safeIcon: string | null };

type Inventory = { providers: DiscoveredWallet[] };
type Selection = Inventory & { selected: DiscoveredWallet };
type AccountState = Selection & { account: Address; chainId: number | null };

export type WalletState =
  | ({ status: "discovering" } & Inventory)
  | ({ status: "unavailable" } & Inventory)
  | ({ status: "disconnected" } & Inventory)
  | ({ status: "connecting" } & Selection)
  | ({ status: "wrong-chain" } & AccountState)
  | ({ status: "connected"; chainId: 84532 } & Omit<AccountState, "chainId">)
  | ({ status: "error"; message: string; account?: Address; chainId?: number | null; selected?: DiscoveredWallet } & Inventory);

export type WalletContextValue = {
  state: WalletState;
  connect(providerId: string): Promise<void>;
  switchToBase(): Promise<void>;
  disconnect(): void;
  clearError(): void;
};
