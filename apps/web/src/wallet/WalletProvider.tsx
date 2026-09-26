"use client";

import { parseWalletAccounts, parseWalletChainId, providerErrorCode, walletErrorMessage, type Address } from "@boss-pool/chain";
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
import type { DiscoveredWallet, SwitchableWalletChain, WalletContextValue, WalletState } from "./types";

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<unknown>;
    "eip6963:requestProvider": Event;
  }
}

const WalletContext = createContext<WalletContextValue | null>(null);
const WALLET_PREFERENCE_KEY = "boss-pool.wallet-preference";

type ActiveProvider = { detail: DiscoveredWallet; cleanup: () => void };
type WalletPreference = { kind: "unknown" | "disabled" } | { kind: "selected"; rdns: string };

function readWalletPreference(): WalletPreference {
  try {
    const stored = window.localStorage.getItem(WALLET_PREFERENCE_KEY);
    if (!stored) return { kind: "unknown" };
    const value: unknown = JSON.parse(stored);
    if (value && typeof value === "object") {
      const preference = value as { reconnect?: unknown; rdns?: unknown };
      if (preference.reconnect === false) return { kind: "disabled" };
      if (preference.reconnect === true && typeof preference.rdns === "string" && preference.rdns.trim()) {
        return { kind: "selected", rdns: preference.rdns.trim() };
      }
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  return { kind: "unknown" };
}

function writeWalletPreference(preference: WalletPreference): void {
  try {
    const value = preference.kind === "selected"
      ? { reconnect: true, rdns: preference.rdns }
      : { reconnect: false };
    window.localStorage.setItem(WALLET_PREFERENCE_KEY, JSON.stringify(value));
  } catch {
    // Wallet connection remains usable when storage is unavailable.
  }
}

function accountState(
  providers: DiscoveredWallet[],
  selected: DiscoveredWallet,
  account: Address,
  chainId: number | null,
): WalletState {
  return { status: "connected", providers, selected, account, chainId };
}

function disconnectedState(providers: DiscoveredWallet[]): WalletState {
  return { status: "disconnected", providers };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WalletState>({ status: "discovering", providers: [] });
  const stateRef = useRef(state);
  const activeRef = useRef<ActiveProvider | null>(null);
  const opRef = useRef(0);
  const preferenceRef = useRef<WalletPreference>({ kind: "unknown" });
  const manualConnectOpRef = useRef<number | null>(null);
  const chooserOpRef = useRef<number | null>(null);

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
          opRef.current += 1;
          detach();
          setState((s) => disconnectedState(s.providers));
          return;
        }
        setState((s) => accountState(
          s.providers,
          detail,
          accounts[0]!,
          "chainId" in s ? (s.chainId ?? null) : null,
        ));
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
        opRef.current += 1;
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

  // Discovery never prompts; connect() asks permission only after an explicit user action.
  useEffect(() => {
    let effectActive = true;
    let discovered: DiscoveredWallet[] = [];
    const restoring = new Set<string>();
    preferenceRef.current = readWalletPreference();
    const reconnect = async (detail: DiscoveredWallet) => {
      if (!effectActive || manualConnectOpRef.current !== null || activeRef.current?.detail.info.rdns === detail.info.rdns || restoring.has(detail.info.rdns)) return;
      restoring.add(detail.info.rdns);
      const op = ++opRef.current;
      try {
        const accounts = parseWalletAccounts(await detail.provider.request({ method: "eth_accounts" }));
        if (accounts.length === 0 || !effectActive || op !== opRef.current) return;
        const chainId = parseWalletChainId(await detail.provider.request({ method: "eth_chainId" }));
        if (!effectActive || op !== opRef.current) return;
        attach(detail);
        setState((s) => accountState(s.providers, detail, accounts[0]!, chainId));
        if (preferenceRef.current.kind === "unknown") {
          const preference = { kind: "selected", rdns: detail.info.rdns } as const;
          preferenceRef.current = preference;
          writeWalletPreference(preference);
        }
      } catch {
        // A failed silent read leaves the app disconnected; the user can still connect explicitly.
      } finally {
        restoring.delete(detail.info.rdns);
      }
    };
    const onAnnounce = (event: CustomEvent<unknown>) => {
      const wallet = normalizeProviderDetail(event.detail);
      if (!wallet) return;
      discovered = appendProvider(discovered, wallet);
      setState((s) =>
        s.status === "unavailable"
          ? disconnectedState(appendProvider(s.providers, wallet))
          : { ...s, providers: appendProvider(s.providers, wallet) },
      );
      const preference = preferenceRef.current;
      if (preference.kind === "selected" && preference.rdns === wallet.info.rdns) void reconnect(wallet);
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
      const preference = preferenceRef.current;
      if (preference.kind === "selected") {
        const selected = providers.find((provider) => provider.info.rdns === preference.rdns);
        if (selected) void reconnect(selected);
      } else if (preference.kind === "unknown" && providers.length === 1) {
        void reconnect(providers[0]!);
      }
    }, 0);

    return () => {
      effectActive = false;
      opRef.current += 1;
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
      chooserOpRef.current = null;
      manualConnectOpRef.current = op;
      detach();
      const preference = { kind: "selected", rdns: detail.info.rdns } as const;
      preferenceRef.current = preference;
      writeWalletPreference(preference);
      setState((s) => ({ status: "connecting", providers: s.providers, selected: detail }));
      try {
        const accounts = parseWalletAccounts(await detail.provider.request({ method: "eth_requestAccounts" }));
        if (accounts.length === 0) throw new Error("Wallet returned no accounts.");
        if (op !== opRef.current) return;
        const chainId = parseWalletChainId(await detail.provider.request({ method: "eth_chainId" }));
        if (op !== opRef.current) return;
        attach(detail);
        setState((s) => accountState(s.providers, detail, accounts[0]!, chainId));
      } catch (error) {
        if (op !== opRef.current) return;
        setState((s) => ({ status: "error", message: walletErrorMessage(error), providers: s.providers, selected: detail }));
      } finally {
        if (manualConnectOpRef.current === op) manualConnectOpRef.current = null;
      }
    },
    [attach, detach],
  );

  const requestConnect = useCallback(async () => {
    const current = stateRef.current;
    if (current.status === "discovering" || current.status === "connecting" || current.status === "choosing") return;
    if (current.providers.length === 1) {
      await connect(current.providers[0]!.info.uuid);
    } else if (current.providers.length > 1) {
      const op = ++opRef.current;
      chooserOpRef.current = op;
      manualConnectOpRef.current = op;
      setState({ status: "choosing", providers: current.providers });
    }
  }, [connect]);

  const cancelConnect = useCallback(() => {
    const chooserOp = chooserOpRef.current;
    chooserOpRef.current = null;
    if (manualConnectOpRef.current === chooserOp) manualConnectOpRef.current = null;
    setState((s) => s.status === "choosing" ? disconnectedState(s.providers) : s);
  }, []);

  const switchToChain = useCallback(async (chain: SwitchableWalletChain) => {
    const active = activeRef.current;
    const current = stateRef.current;
    if (!active || !("account" in current) || !current.account) return;
    const { detail } = active;
    const previousAccount = current.account;
    const previousChainId = current.chainId ?? null;
    const op = ++opRef.current;
    setState((s) => ({
      status: "connecting",
      providers: s.providers,
      selected: detail,
      account: previousAccount,
      chainId: previousChainId,
    }));
    const chainIdHex = `0x${chain.id.toString(16)}`;
    const switchChain = () => detail.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex }] });
    try {
      try {
        await switchChain();
      } catch (error) {
        if (providerErrorCode(error) !== 4902) throw error;
        await detail.provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: chainIdHex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls,
            blockExplorerUrls: chain.blockExplorerUrls,
          }],
        });
        await switchChain();
      }
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
      throw error;
    }
  }, [detach]);

  // Local cleanup only. The wallet keeps whatever permission it granted; we do not claim to revoke it.
  const disconnect = useCallback(() => {
    opRef.current += 1;
    chooserOpRef.current = null;
    manualConnectOpRef.current = null;
    preferenceRef.current = { kind: "disabled" };
    writeWalletPreference(preferenceRef.current);
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
    () => ({ state, connect, requestConnect, cancelConnect, switchToChain, disconnect, clearError }),
    [state, connect, requestConnect, cancelConnect, switchToChain, disconnect, clearError],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider");
  return value;
}
