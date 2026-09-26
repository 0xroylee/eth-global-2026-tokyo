"use client";

import {
  createBossPoolSdk,
  createPublicClientForNetwork,
  DEFAULT_BASE_SEPOLIA_RPC_URL,
  DEFAULT_LOCAL_RPC_URL,
  DEFAULT_ROBINHOOD_RPC_URL,
  fetchBaseSepoliaDeployment,
  fetchLocalDeployment,
  fetchRobinhoodDeployment,
  BASE_SEPOLIA_CHAIN_ID,
  LOCAL_CHAIN_ID,
  parseDeployment,
  RequoteRequiredError,
  ROBINHOOD_TESTNET_CHAIN_ID,
  TransactionReplacedError,
  TransactionRevertedError,
  verifyDeployment,
  type Address,
  type BossPoolSdk,
  type DeploymentManifest,
  type EIP1193Provider,
  type PendingActionKind,
  type PendingOperation,
  type PendingRequest,
  type SkippedApproval,
  type SupportedChainId,
  type WaitResult,
} from "@boss-pool/chain";
import { useWallet } from "@/wallet/WalletProvider";
import { createWalletClient, custom, defineChain, UserRejectedRequestError, type WalletClient } from "viem";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type NetworkKey = "local" | "base-sepolia" | "robinhood-testnet";

type VerifiedContext = {
  key: NetworkKey;
  manifest: DeploymentManifest;
  rpcUrl: string;
  publicClient: ReturnType<typeof createPublicClientForNetwork>;
  deployment: Awaited<ReturnType<typeof verifyDeployment>>;
  publicSdk: BossPoolSdk;
};

type WalletState = {
  provider?: EIP1193Provider;
  account?: Address;
  chainId?: number;
  status: "checking" | "missing" | "disconnected" | "choosing" | "connected";
  error?: string;
  busy?: boolean;
};

type StoredPending = {
  network: NetworkKey;
  manifest: DeploymentManifest;
  request: PendingRequest;
  submittedAt: number;
};

export type WriteState =
  | { status: "idle" }
  | { status: "prompting"; action: string; network: NetworkKey; manifest: DeploymentManifest }
  | { status: "pending"; action: string; record: StoredPending }
  | { status: "unresolved"; action: string; record: StoredPending; message: string }
  | { status: "confirmed"; action: string; record: StoredPending; result: unknown }
  | { status: "rejected" | "requote" | "reverted" | "replaced" | "failed"; action: string; hash?: string; message: string };

export type DeploymentState =
  | { kind: "loading"; network: NetworkKey }
  | { kind: "not-deployed"; network: NetworkKey }
  | { kind: "error"; network: NetworkKey; message: string }
  | {
      kind: "live";
      network: NetworkKey;
      manifest: DeploymentManifest;
      rpcUrl: string;
      context: VerifiedContext;
      round: Awaited<ReturnType<BossPoolSdk["readRound"]>>;
      player?: Awaited<ReturnType<BossPoolSdk["readPlayer"]>>;
      /** Local clock anchor for blockTimestamp, retained when that timestamp has not advanced. */
      readAt: number;
    };

const REFRESH_MS = 5_000;
const PENDING_STORAGE_KEY = "boss-pool.pending-write.v2";

export function useBossPool() {
  const [network, setNetwork] = useState<NetworkKey>("base-sepolia");
  const { state: sharedWallet, requestConnect, switchToChain } = useWallet();
  const [deployment, setDeployment] = useState<DeploymentState>({ kind: "loading", network: "base-sepolia" });
  const [refreshVersion, setRefreshVersion] = useState(0);
  const contextRef = useRef<VerifiedContext | null>(null);
  const pendingRef = useRef<StoredPending | null>(null);
  const writeLock = useRef(false);
  const [pendingRecord, setPendingRecord] = useState<StoredPending | null>(null);
  const [writeState, setWriteState] = useState<WriteState>({ status: "idle" });

  const selectedChainId: SupportedChainId = chainIdForNetwork(network);
  const fallbackRpcUrl = rpcUrlForNetwork(network);
  const targetRpcUrl = deployment.kind === "live" && deployment.network === network ? deployment.rpcUrl : fallbackRpcUrl;
  const selectedWallet = "selected" in sharedWallet ? sharedWallet.selected : undefined;
  const walletAccount = "account" in sharedWallet ? sharedWallet.account : undefined;
  const walletChainId = "chainId" in sharedWallet ? sharedWallet.chainId ?? undefined : undefined;
  const wallet: WalletState = {
    provider: selectedWallet?.provider,
    account: walletAccount,
    chainId: walletChainId,
    status: sharedWallet.status === "discovering" ? "checking"
      : sharedWallet.status === "unavailable" ? "missing"
        : sharedWallet.status === "choosing" ? "choosing"
          : walletAccount ? "connected" : "disconnected",
    error: sharedWallet.status === "error" ? sharedWallet.message : undefined,
    busy: sharedWallet.status === "connecting" || sharedWallet.status === "choosing",
  };
  const walletChain = useMemo(
    () => defineChain({
      id: selectedChainId,
      name: networkName(network),
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [targetRpcUrl] } },
    }),
    [network, selectedChainId, targetRpcUrl],
  );

  useEffect(() => {
    const stored = readStoredPending();
    if (!stored) return;
    pendingRef.current = stored;
    setPendingRecord(stored);
    setWriteState({
      status: "unresolved",
      action: stored.request.kind,
      record: stored,
      message: "A submitted transaction is waiting for receipt recovery.",
    });
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    contextRef.current = contextRef.current?.key === network ? contextRef.current : null;
    setDeployment((current) => {
      if (current.kind === "live" && current.network === network) {
        const sameAccount = current.player?.account.toLowerCase() === wallet.account?.toLowerCase();
        return sameAccount ? current : { ...current, player: undefined };
      }
      if (current.kind === "loading" && current.network === network) return current;
      return { kind: "loading", network };
    });

    const poll = async () => {
      try {
        const manifest = await fetchDeploymentForNetwork(network);
        const rpcUrl = deploymentRpcUrl(network, manifest.chainId === LOCAL_CHAIN_ID ? manifest.rpcUrl : undefined);
        let context = contextRef.current;
        if (!context || !sameDeployment(context, network, manifest, rpcUrl)) {
          const publicClient = createPublicClientForNetwork(selectedChainId, rpcUrl);
          const verified = await verifyDeployment(publicClient, manifest);
          if (!active) return;
          context = {
            key: network,
            manifest,
            rpcUrl,
            publicClient,
            deployment: verified,
            publicSdk: createBossPoolSdk({ publicClient, deployment: verified }),
          };
          contextRef.current = context;
        }
        if (!active) return;
        if (!context) throw new Error("Verified deployment context is unavailable.");
        const snapshot = await context.publicSdk.readState(wallet.account);
        if (active && contextRef.current === context) {
          setDeployment((current) => ({
            kind: "live",
            network,
            manifest: context.manifest,
            rpcUrl: context.rpcUrl,
            context,
            round: snapshot.round,
            player: snapshot.player,
            readAt: current.kind === "live" && current.network === network &&
              current.manifest.deploymentTxHash === context.manifest.deploymentTxHash &&
              current.round.blockTimestamp === snapshot.round.blockTimestamp ? current.readAt : Date.now(),
          }));
        }
      } catch (error) {
        if (!active) return;
        const message = errorMessage(error);
        if (message.includes("_DEPLOYMENT_MISSING")) {
          setDeployment({ kind: "not-deployed", network });
        } else {
          setDeployment({ kind: "error", network, message });
        }
      } finally {
        if (active) timer = window.setTimeout(poll, REFRESH_MS);
      }
    };

    void poll();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [network, refreshVersion, selectedChainId, wallet.account, wallet.chainId]);

  const walletClient: WalletClient | undefined = useMemo(() => {
    if (!wallet.provider || !wallet.account || wallet.chainId !== selectedChainId) return undefined;
    return createWalletClient({ account: wallet.account, chain: walletChain, transport: custom(wallet.provider) });
  }, [wallet.provider, wallet.account, wallet.chainId, selectedChainId, walletChain]);

  const readyContext = deployment.kind === "live" ? deployment.context : null;
  const sdk = useMemo(() => {
    if (!readyContext) return undefined;
    return walletClient
      ? readyContext.publicSdk.withWallet(walletClient)
      : readyContext.publicSdk;
  }, [readyContext, walletClient]);

  const connect = useCallback(() => requestConnect(), [requestConnect]);

  const switchToSelectedNetwork = useCallback(async () => {
    if (!wallet.provider) throw new Error("Connect an injected wallet before switching networks.");
    await switchToChain({
      id: selectedChainId,
      name: networkName(network),
      rpcUrls: [targetRpcUrl],
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    });
  }, [network, selectedChainId, switchToChain, targetRpcUrl, wallet.provider]);

  const refresh = useCallback(() => setRefreshVersion((value) => value + 1), []);
  const networkMismatch = Boolean(wallet.account && wallet.chainId !== selectedChainId);

  const waitForPending = useCallback(async <T,>(
    operation: PendingOperation<T>,
    record: StoredPending,
  ): Promise<WaitResult<T>> => {
    setWriteState({ status: "pending", action: operation.action, record });
    const result = await operation.wait();
    if (result.status === "unresolved") {
      setWriteState({
        status: "unresolved",
        action: operation.action,
        record,
        message: "The receipt has not arrived yet. The hash is saved; resume receipt checks when ready.",
      });
      pendingRef.current = record;
      setPendingRecord(record);
      return result;
    }
    clearStoredPending();
    pendingRef.current = null;
    setPendingRecord(null);
    setWriteState({ status: "confirmed", action: operation.action, record, result: result.result });
    setRefreshVersion((value) => value + 1);
    return result;
  }, []);

  const runPending = useCallback(async <T,>(
    action: string,
    submit: () => Promise<PendingOperation<T> | SkippedApproval>,
  ): Promise<WaitResult<T> | SkippedApproval | undefined> => {
    const origin = deployment.kind === "live" && deployment.network === network ? deployment.context : null;
    if (writeLock.current || pendingRef.current) {
      setWriteState({ status: "failed", action, message: "Resolve the submitted transaction before starting another wallet action." });
      return undefined;
    }
    if (!origin) {
      setWriteState({ status: "failed", action, message: "The selected deployment is not currently verified." });
      return undefined;
    }
    writeLock.current = true;
    setWriteState({ status: "prompting", action, network: origin.key, manifest: origin.manifest });
    try {
      const operation = await submit();
      if (isSkippedApproval(operation)) {
        setWriteState({ status: "idle" });
        setRefreshVersion((value) => value + 1);
        return operation;
      }
      const record: StoredPending = {
        network: origin.key,
        manifest: origin.manifest,
        request: operation.request,
        submittedAt: Date.now(),
      };
      saveStoredPending(record);
      pendingRef.current = record;
      setPendingRecord(record);
      return await waitForPending(operation, record);
    } catch (error) {
      const hash = error instanceof TransactionRevertedError
        ? error.hash
        : error instanceof TransactionReplacedError
          ? error.originalHash
          : undefined;
      const status = error instanceof TransactionRevertedError
        ? "reverted"
        : error instanceof TransactionReplacedError
          ? "replaced"
          : error instanceof RequoteRequiredError
            ? "requote"
            : isUserRejected(error)
              ? "rejected"
              : "failed";
      if (error instanceof TransactionRevertedError || error instanceof TransactionReplacedError) {
        clearStoredPending();
        pendingRef.current = null;
        setPendingRecord(null);
      }
      setWriteState({ status, action, hash, message: errorMessage(error) });
      throw error;
    } finally {
      writeLock.current = false;
    }
  }, [network, deployment, waitForPending]);

  const resumePending = useCallback(async () => {
    const record = pendingRef.current;
    if (!record || writeLock.current) return;
    writeLock.current = true;
    setWriteState({ status: "pending", action: record.request.kind, record });
    try {
      const context = deployment.kind === "live" && deployment.network === record.network &&
        sameDeployment(deployment.context, record.network, record.manifest, deployment.rpcUrl)
        ? deployment.context
        : await loadVerifiedContext(record.network, record.manifest);
      const operation = context.publicSdk.resumePending(record.request);
      await waitForPending(operation, record);
    } catch (error) {
      if (error instanceof TransactionRevertedError || error instanceof TransactionReplacedError) {
        clearStoredPending();
        pendingRef.current = null;
        setPendingRecord(null);
        setWriteState({
          status: error instanceof TransactionRevertedError ? "reverted" : "replaced",
          action: record.request.kind,
          hash: error instanceof TransactionRevertedError ? error.hash : error.originalHash,
          message: errorMessage(error),
        });
      } else {
        setWriteState({
          status: "unresolved",
          action: record.request.kind,
          record,
          message: `Receipt recovery needs attention: ${errorMessage(error)}`,
        });
      }
    } finally {
      writeLock.current = false;
    }
  }, [deployment, waitForPending]);

  return {
    network,
    selectNetwork: setNetwork,
    selectedChainId,
    deployment,
    wallet,
    sdk,
    canWrite: Boolean(network !== "robinhood-testnet" && wallet.account && walletClient && sdk),
    networkMismatch,
    connect,
    switchToSelectedNetwork,
    refresh,
    runPending,
    resumePending,
    pendingRecord,
    writeState,
  };
}

async function loadVerifiedContext(network: NetworkKey, originManifest?: DeploymentManifest): Promise<VerifiedContext> {
  const manifest = originManifest ?? await fetchDeploymentForNetwork(network);
  const chainId = chainIdForNetwork(network);
  if (manifest.chainId !== chainId) throw new Error("Saved deployment identity does not match its originating network.");
  const rpcUrl = deploymentRpcUrl(network, manifest.chainId === LOCAL_CHAIN_ID ? manifest.rpcUrl : undefined);
  const publicClient = createPublicClientForNetwork(chainId, rpcUrl);
  const deployment = await verifyDeployment(publicClient, manifest);
  return {
    key: network,
    manifest,
    rpcUrl,
    publicClient,
    deployment,
    publicSdk: createBossPoolSdk({ publicClient, deployment }),
  };
}

async function fetchDeploymentForNetwork(network: NetworkKey): Promise<DeploymentManifest> {
  if (network === "local") return fetchLocalDeployment();
  if (network === "base-sepolia") return fetchBaseSepoliaDeployment();
  return fetchRobinhoodDeployment();
}

function chainIdForNetwork(network: NetworkKey): SupportedChainId {
  if (network === "local") return LOCAL_CHAIN_ID;
  if (network === "base-sepolia") return BASE_SEPOLIA_CHAIN_ID;
  return ROBINHOOD_TESTNET_CHAIN_ID;
}

function networkName(network: NetworkKey): string {
  if (network === "local") return "Boss Pool Local";
  if (network === "base-sepolia") return "Base Sepolia";
  return "Robinhood Testnet (historical)";
}

function rpcUrlForNetwork(network: NetworkKey): string {
  if (network === "local") return process.env.NEXT_PUBLIC_BOSS_POOL_LOCAL_RPC_URL ?? DEFAULT_LOCAL_RPC_URL;
  if (network === "base-sepolia") return process.env.NEXT_PUBLIC_BOSS_POOL_BASE_SEPOLIA_RPC_URL ?? DEFAULT_BASE_SEPOLIA_RPC_URL;
  return process.env.NEXT_PUBLIC_BOSS_POOL_ROBINHOOD_RPC_URL ?? DEFAULT_ROBINHOOD_RPC_URL;
}

function deploymentRpcUrl(network: NetworkKey, manifestRpcUrl?: string): string {
  return network === "local" ? process.env.NEXT_PUBLIC_BOSS_POOL_LOCAL_RPC_URL ?? manifestRpcUrl ?? DEFAULT_LOCAL_RPC_URL : rpcUrlForNetwork(network);
}

function isSkippedApproval<T>(value: PendingOperation<T> | SkippedApproval): value is SkippedApproval {
  return "status" in value && value.status === "skipped";
}

function readStoredPending(): StoredPending | null {
  try {
    const raw = window.localStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object") return null;
    const item = value as Partial<StoredPending>;
    if (
      (item.network !== "local" && item.network !== "base-sepolia" && item.network !== "robinhood-testnet") ||
      !item.request || typeof item.request !== "object" || typeof item.submittedAt !== "number" || !item.manifest
    ) return null;
    const manifest = parseDeployment(item.manifest);
    const request = item.request as Partial<PendingRequest>;
    const kinds: readonly PendingActionKind[] = ["approval", "attack", "claimReward", "claimVictoryNFT", "faucetMockUSD"];
    if (
      typeof request.hash !== "string" || !/^0x[\da-fA-F]{64}$/.test(request.hash) ||
      !request.kind || !kinds.includes(request.kind) || typeof request.chainId !== "number" ||
      !isAddressValue(request.account) || !isAddressValue(request.target) ||
      typeof request.calldata !== "string" || !/^0x[\da-fA-F]*$/.test(request.calldata)
    ) return null;
    const expectedChainId = chainIdForNetwork(item.network);
    if (request.chainId !== expectedChainId || manifest.chainId !== expectedChainId) return null;
    return { network: item.network, manifest, submittedAt: item.submittedAt, request: request as PendingRequest };
  } catch {
    return null;
  }
}

function saveStoredPending(record: StoredPending): void {
  try {
    window.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Keep the current page's hash even when browser storage is unavailable.
  }
}

function clearStoredPending(): void {
  try {
    window.localStorage.removeItem(PENDING_STORAGE_KEY);
  } catch {
    // The confirmed result remains visible in memory until the next page load.
  }
}

function sameDeployment(
  current: VerifiedContext,
  key: NetworkKey,
  next: DeploymentManifest,
  rpcUrl: string,
): boolean {
  if (
    current.key !== key || current.rpcUrl !== rpcUrl || current.manifest.chainId !== next.chainId ||
    current.manifest.deploymentTxHash.toLowerCase() !== next.deploymentTxHash.toLowerCase()
  ) return false;
  const oldAddresses = current.manifest.addresses;
  return Object.keys(oldAddresses).every((name) => {
    const address = name as keyof typeof oldAddresses;
    return oldAddresses[address].toLowerCase() === next.addresses[address].toLowerCase();
  });
}

function isAddressValue(value: unknown): value is Address {
  return typeof value === "string" && /^0x[\da-fA-F]{40}$/.test(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The chain request failed.";
}

function providerErrorCode(error: unknown): number | undefined {
  const visited = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("code" in current) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "number") return code;
    }
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return undefined;
}

function isUserRejected(error: unknown): boolean {
  const visited = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if (current instanceof UserRejectedRequestError || providerErrorCode(current) === 4001) return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}
