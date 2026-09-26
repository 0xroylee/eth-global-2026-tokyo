"use client";

import {
  BASE_SEPOLIA_CHAIN,
  parseWalletAccounts,
  parseWalletChainId,
  switchToBaseSepolia,
  walletErrorMessage,
  type Address,
} from "@boss-pool/chain";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { appendProvider, isEip1193Provider, legacyProviderDetail, normalizeProviderDetail } from "./discovery";
import type { DiscoveredWallet, WalletContextValue, WalletState } from "./types";

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<unknown>;
    "eip6963:requestProvider": Event;
  }
}

const WalletContext = createContext<WalletContextValue | null>(null);

type ActiveProvider = { detail: DiscoveredWallet; cleanup: () => void };

function accountState(
  providers: DiscoveredWallet[],
  selected: DiscoveredWallet,
  account: Address,
  chainId: number | null,
): WalletState {
  if (chainId === BASE_SEPOLIA_CHAIN.id) return { status: "connected", providers, selected, account, chainId: 84532 };
  return { status: "wrong-chain", providers, selected, account, chainId };
}

function disconnectedState(providers: DiscoveredWallet[]): WalletState {
  return { status: "disconnected", providers };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({ status: "discovering", providers: [] });
  const stateRef = useRef(state);
  const activeRef = useRef<ActiveProvider | null>(null);
  // Bumped whenever a new request sequence starts so stale async results are ignored.
  const opRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const detach = useCallback(() => {
    activeRef.current?.cleanup();
    activeRef.current = null;
  }, []);

  const attach = useCallback(
    (detail: DiscoveredWallet) => {
      detach();
      const { provider } = detail;
      const onAccountsChanged = (value: unknown) => {
        const accounts = parseWalletAccounts(value);
        if (accounts.length === 0) {
          detach();
          setState((s) => disconnectedState(s.providers));
          return;
        }
        setState((s) => accountState(s.providers, detail, accounts[0]!, "chainId" in s ? (s.chainId ?? null) : null));
      };
      const onChainChanged = (value: unknown) => {
        const chainId = parseWalletChainId(value);
        setState((s) => {
          if (!("account" in s) || !s.account) return s;
          if (chainId === null) {
            return {
              status: "error",
              message: "Wallet reported an unreadable chain id.",
              providers: s.providers,
              selected: detail,
              account: s.account,
              chainId: null,
            };
          }
          return accountState(s.providers, detail, s.account, chainId);
        });
      };
      const onDisconnect = () => {
        detach();
        setState((s) => disconnectedState(s.providers));
      };
      provider.on("accountsChanged", onAccountsChanged);
      provider.on("chainChanged", onChainChanged);
      provider.on("disconnect", onDisconnect);
      activeRef.current = {
        detail,
        cleanup: () => {
          provider.removeListener("accountsChanged", onAccountsChanged);
          provider.removeListener("chainChanged", onChainChanged);
          provider.removeListener("disconnect", onDisconnect);
        },
      };
    },
    [detach],
  );

  // Discovery never prompts: EIP-6963 announcements first, then a bare window.ethereum fallback.
  useEffect(() => {
    let discovered: DiscoveredWallet[] = [];
    const onAnnounce = (event: CustomEvent<unknown>) => {
      const wallet = normalizeProviderDetail(event.detail);
      if (!wallet) return;
      discovered = appendProvider(discovered, wallet);
      setState((s) =>
        s.status === "unavailable"
          ? disconnectedState(appendProvider(s.providers, wallet))
          : { ...s, providers: appendProvider(s.providers, wallet) },
      );
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const settle = window.setTimeout(() => {
      if (discovered.length === 0) {
        const legacy = (window as { ethereum?: unknown }).ethereum;
        if (isEip1193Provider(legacy)) discovered = [legacyProviderDetail(legacy)];
      }
      const providers = discovered;
      setState((s) => (s.status === "discovering" ? (providers.length ? disconnectedState(providers) : { status: "unavailable", providers }) : s));
      if (providers.length === 1) void reconnect(providers[0]!);
    }, 0);

    // Silent reconnect: eth_accounts only returns accounts the user already authorized. Never eth_requestAccounts here.
    const reconnect = async (detail: DiscoveredWallet) => {
      const op = ++opRef.current;
      try {
        const accounts = parseWalletAccounts(await detail.provider.request({ method: "eth_accounts" }));
        if (accounts.length === 0 || op !== opRef.current) return;
        const chainId = parseWalletChainId(await detail.provider.request({ method: "eth_chainId" }));
        if (op !== opRef.current) return;
        attach(detail);
        setState((s) => accountState(s.providers, detail, accounts[0]!, chainId));
      } catch {
        // A failed silent read leaves the app disconnected; the user can still connect explicitly.
      }
    };

    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.clearTimeout(settle);
      detach();
    };
  }, [attach, detach]);

  const connect = useCallback(
    async (providerId: string) => {
      const detail = stateRef.current.providers.find((entry) => entry.info.uuid === providerId);
      if (!detail) {
        setState((s) => ({ status: "error", message: "That wallet is no longer available.", providers: s.providers }));
        return;
      }
      const op = ++opRef.current;
      detach();
      setState((s) => ({ status: "connecting", providers: s.providers, selected: detail }));
      try {
        const accounts = parseWalletAccounts(await detail.provider.request({ method: "eth_requestAccounts" }));
        if (accounts.length === 0) throw new Error("Wallet returned no accounts.");
        const chainId = parseWalletChainId(await detail.provider.request({ method: "eth_chainId" }));
        if (op !== opRef.current) return;
        attach(detail);
        setState((s) => accountState(s.providers, detail, accounts[0]!, chainId));
      } catch (error) {
        if (op !== opRef.current) return;
        setState((s) => ({ status: "error", message: walletErrorMessage(error), providers: s.providers, selected: detail }));
      }
    },
    [attach, detach],
  );

  const switchToBase = useCallback(async () => {
    const active = activeRef.current;
    const current = stateRef.current;
    if (!active || !("account" in current) || !current.account) return;
    const { detail } = active;
    const previousAccount = current.account;
    const previousChainId = current.chainId ?? null;
    const op = ++opRef.current;
    setState((s) => ({ status: "connecting", providers: s.providers, selected: detail }));
    try {
      await switchToBaseSepolia(detail.provider);
      const chainId = parseWalletChainId(await detail.provider.request({ method: "eth_chainId" }));
      const accounts = parseWalletAccounts(await detail.provider.request({ method: "eth_accounts" }));
      if (op !== opRef.current) return;
      if (accounts.length === 0) {
        detach();
        setState((s) => disconnectedState(s.providers));
        return;
      }
      setState((s) => accountState(s.providers, detail, accounts[0]!, chainId));
    } catch (error) {
      if (op !== opRef.current) return;
      setState((s) => ({
        status: "error",
        message: walletErrorMessage(error),
        providers: s.providers,
        selected: detail,
        account: previousAccount,
        chainId: previousChainId,
      }));
    }
  }, [detach]);

  // Local cleanup only. The wallet keeps whatever permission it granted; we do not claim to revoke it.
  const disconnect = useCallback(() => {
    opRef.current += 1;
    detach();
    setState((s) => disconnectedState(s.providers));
  }, [detach]);

  const clearError = useCallback(() => {
    setState((s) => {
      if (s.status !== "error") return s;
      if (s.selected && s.account && activeRef.current) return accountState(s.providers, s.selected, s.account, s.chainId ?? null);
      return disconnectedState(s.providers);
    });
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({ state, connect, switchToBase, disconnect, clearError }),
    [state, connect, switchToBase, disconnect, clearError],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
