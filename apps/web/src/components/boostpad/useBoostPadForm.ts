"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BossFactorySdkError,
  FactoryOperationTerminalError,
  BASE_SEPOLIA_CHAIN,
  createBaseSepoliaPublicClient,
  createBaseSepoliaWalletClient,
  createBossFactorySdk,
  fetchBaseSepoliaDeployment,
  isAddress,
  readErc20TokenInfo,
  type Address,
  type Erc20TokenInfo,
  type FactoryBuildStatus,
  type FactoryLaunchConfig,
  type FactoryLaunchProgress,
  type FactoryLaunchQuote,
  type FactoryLaunchResult,
} from "@boss-pool/chain";
import { useFactoryOperation } from "../FactoryOperationProvider";
import { isCurrentQuoteResponse, isCurrentTokenResponse, parseStrictUnits, sameAddressText } from "@/lib/factory-form";
import { useWallet } from "@/wallet/WalletProvider";

const BASE_SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_BOSS_POOL_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const rawFactoryAddress = process.env.NEXT_PUBLIC_BOSS_FACTORY_BASE_SEPOLIA_ADDRESS;
const configuredFactoryAddress = rawFactoryAddress && isAddress(rawFactoryAddress, { strict: false })
  ? rawFactoryAddress as Address
  : undefined;

type LaunchQuoteState = { config: FactoryLaunchConfig; quote: FactoryLaunchQuote };
type FactoryBuildState = FactoryBuildStatus | { status: "checking" | "unconfigured" } | { status: "error"; message: string };

export function useBoostPadForm(initiallyOpen = false) {
  const [formOpen, setFormOpen] = useState(initiallyOpen);
  const openForm = useCallback(() => setFormOpen(true), []);
  const closeForm = useCallback(() => setFormOpen(false), []);
  const { state: walletState } = useWallet();
  const onBaseSepolia = walletState.status === "connected" && walletState.chainId === BASE_SEPOLIA_CHAIN.id;
  const account = onBaseSepolia ? walletState.account : undefined;
  const provider = onBaseSepolia ? walletState.selected.provider : undefined;
  const [factoryAddress, setFactoryAddress] = useState(configuredFactoryAddress);
  const [factoryBuild, setFactoryBuild] = useState<FactoryBuildState>(
    configuredFactoryAddress ? { status: "checking" } : { status: "unconfigured" },
  );
  const publicClient = useMemo(() => createBaseSepoliaPublicClient(BASE_SEPOLIA_RPC_URL), []);
  useEffect(() => {
    if (configuredFactoryAddress) return;
    let active = true;
    void fetchBaseSepoliaDeployment().then((manifest) => {
      if (active && manifest.bossFactory) setFactoryAddress(manifest.bossFactory);
    }).catch((cause) => {
      if (active) setError(errorMessage(cause));
    });
    return () => { active = false; };
  }, []);
  const reader = useMemo(
    () => factoryAddress ? createBossFactorySdk({ publicClient, factory: factoryAddress }) : undefined,
    [factoryAddress, publicClient],
  );
  useEffect(() => {
    if (!reader) {
      setFactoryBuild({ status: factoryAddress ? "checking" : "unconfigured" });
      return;
    }
    let active = true;
    setFactoryBuild({ status: "checking" });
    void reader.checkFactoryBuild().then((status) => {
      if (active) setFactoryBuild(status);
    }).catch((cause) => {
      if (active) setFactoryBuild({ status: "error", message: errorMessage(cause) });
    });
    return () => { active = false; };
  }, [factoryAddress, reader]);
  const sdk = useMemo(() => {
    if (!reader || !provider || !account) return undefined;
    return reader.withWallet(createBaseSepoliaWalletClient(provider, account));
  }, [account, provider, reader]);
  const factoryOperation = useFactoryOperation();
  const accountRef = useRef(account);
  accountRef.current = account;
  const tokenAddressRef = useRef("");
  const tokenLoadRequestRef = useRef(0);
  const quoteRequestRef = useRef(0);
  const busyLockRef = useRef(false);

  const [tokenAddress, setTokenAddress] = useState("");
  const [tokenInfo, setTokenInfo] = useState<Erc20TokenInfo>();
  const [allocation, setAllocation] = useState("");
  const [prizePercent, setPrizePercent] = useState("10");
  const [volumeTarget, setVolumeTarget] = useState("6000");
  const [quoteState, setQuoteState] = useState<LaunchQuoteState>();
  const [allowance, setAllowance] = useState<bigint>();
  const [progress, setProgress] = useState<FactoryLaunchProgress>();
  const [result, setResult] = useState<FactoryLaunchResult>();
  const [busy, setBusy] = useState<"token" | "quote" | "approve" | "launch" | "resume">();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (factoryOperation.completedResult) setResult(factoryOperation.completedResult);
  }, [factoryOperation.completedResult]);

  const clearQuote = useCallback(() => {
    quoteRequestRef.current++;
    setQuoteState(undefined);
    setAllowance(undefined);
    setResult(undefined);
    setProgress(undefined);
    setError(undefined);
  }, []);

  useEffect(() => {
    quoteRequestRef.current++;
    setQuoteState(undefined);
    setAllowance(undefined);
    setBusy((current) => current === "quote" ? undefined : current);
  }, [account]);

  useEffect(() => {
    const token = tokenInfo?.address;
    if (!token || !sameAddressText(token, tokenAddressRef.current)) return;
    if (!account) {
      setTokenInfo((current) => current ? { ...current, balance: undefined } : current);
      return;
    }
    let active = true;
    setTokenInfo((current) => current && sameAddressText(current.address, token)
      ? { ...current, balance: undefined }
      : current);
    void readErc20TokenInfo(publicClient, token, account).then((value) => {
      if (active && isCurrentTokenResponse(token, tokenAddressRef.current, account, accountRef.current)) setTokenInfo(value);
    }).catch(() => {
      if (active && isCurrentTokenResponse(token, tokenAddressRef.current, account, accountRef.current)) {
        setTokenInfo((current) => current ? { ...current, balance: undefined } : current);
      }
    });
    return () => { active = false; };
  }, [account, publicClient, tokenInfo?.address]);

  useEffect(() => {
    if (!reader || !quoteState || !account) {
      setAllowance(undefined);
      return;
    }
    let active = true;
    void reader.tokenAllowance(quoteState.config.token, account).then((value) => {
      if (active) setAllowance(value);
    }).catch(() => {
      if (active) setAllowance(undefined);
    });
    return () => { active = false; };
  }, [account, quoteState?.config.token, quoteState?.config.tokenAllocation, reader]);

  async function loadToken() {
    const request = ++tokenLoadRequestRef.current;
    const requestedToken = tokenAddress.trim();
    const requestedAccount = account;
    setBusy("token");
    setError(undefined);
    setQuoteState(undefined);
    setAllowance(undefined);
    setResult(undefined);
    try {
      if (!isAddress(requestedToken, { strict: false })) throw new Error("Enter a valid ERC-20 contract address.");
      const info = await readErc20TokenInfo(publicClient, requestedToken as Address, requestedAccount);
      if (!isCurrentTokenResponse(requestedToken, tokenAddressRef.current, requestedAccount, accountRef.current) ||
          request !== tokenLoadRequestRef.current) return;
      setTokenInfo(info);
    } catch (cause) {
      if (request === tokenLoadRequestRef.current &&
          isCurrentTokenResponse(requestedToken, tokenAddressRef.current, requestedAccount, accountRef.current)) {
        setTokenInfo(undefined);
        setError(errorMessage(cause));
      }
    } finally {
      if (request === tokenLoadRequestRef.current) setBusy(undefined);
    }
  }

  function buildConfig(): FactoryLaunchConfig {
    if (!tokenInfo || !sameAddressText(tokenInfo.address, tokenAddress.trim()) || !sameAddressText(tokenAddressRef.current, tokenAddress.trim())) {
      throw new Error("Read the current MEME token address before requesting a quote.");
    }
    const tokenAllocation = parseStrictUnits(allocation.trim(), tokenInfo.decimals);
    const prizeBps = parseStrictUnits(prizePercent.trim(), 2);
    const volumeTargetMockUSD = parseStrictUnits(volumeTarget.trim(), 6);
    if (tokenAllocation < 6n) throw new Error("Allocation must be at least six token base units.");
    if (prizeBps < 1n || prizeBps >= 10_000n) throw new Error("Prize percentage must be greater than 0 and below 100%.");
    if (volumeTargetMockUSD < 6n) throw new Error("MockUSD target must be at least 0.000006.");
    return {
      token: tokenInfo.address,
      tokenAllocation,
      prizeBps: Number(prizeBps),
      volumeTargetMockUSD,
      deadline: 0n,
      maxAttackTokenPerMockUSDX128: 0n,
    };
  }

  async function requestQuote() {
    if (!reader || factoryBuild.status !== "compatible" || busy || factoryLocked) return;
    const request = ++quoteRequestRef.current;
    const requestedAccount = account;
    setBusy("quote");
    setError(undefined);
    setResult(undefined);
    try {
      const config = buildConfig();
      const quote = await reader.quoteLaunch(config);
      if (!isCurrentQuoteResponse(request, quoteRequestRef.current, requestedAccount, accountRef.current,
          config.token, tokenAddressRef.current)) return;
      if (quote.maxRoyPerMockUSDX128 <= 0n) throw new Error("The Factory quote did not return a usable attack-token rate.");
      const acceptedConfig = { ...config, maxAttackTokenPerMockUSDX128: quote.maxRoyPerMockUSDX128 };
      const nextAllowance = requestedAccount ? await reader.tokenAllowance(config.token, requestedAccount) : undefined;
      if (!isCurrentQuoteResponse(request, quoteRequestRef.current, requestedAccount, accountRef.current,
          config.token, tokenAddressRef.current)) return;
      setQuoteState({ config: acceptedConfig, quote });
      setAllowance(nextAllowance);
    } catch (cause) {
      if (request === quoteRequestRef.current && accountRef.current === requestedAccount) {
        setQuoteState(undefined);
        setError(errorMessage(cause));
      }
    } finally {
      if (request === quoteRequestRef.current && accountRef.current === requestedAccount) setBusy(undefined);
    }
  }

  async function approveAllocation() {
    if (!sdk || !quoteState || factoryBuild.status !== "compatible") return;
    if (busyLockRef.current) return;
    const attempt = factoryOperation.begin("approval", account);
    if (!attempt) return;
    busyLockRef.current = true;
    setBusy("approve");
    setError(undefined);
    let submitted = false;
    try {
      await sdk.approveToken(quoteState.config.token, quoteState.config.tokenAllocation, (operation) => {
        submitted = true;
        factoryOperation.record(attempt, operation);
      });
      factoryOperation.finish(attempt);
      setAllowance(await sdk.tokenAllowance(quoteState.config.token, account!));
    } catch (cause) {
      if (cause instanceof FactoryOperationTerminalError || !submitted) factoryOperation.finish(attempt);
      setError(errorMessage(cause));
    } finally {
      busyLockRef.current = false;
      setBusy(undefined);
      factoryOperation.releaseAttempt(attempt);
    }
  }

  async function createBoss() {
    if (!sdk || !quoteState || factoryBuild.status !== "compatible") return;
    if (busyLockRef.current) return;
    const attempt = factoryOperation.begin("launch", account);
    if (!attempt) return;
    busyLockRef.current = true;
    setBusy("launch");
    setError(undefined);
    setResult(undefined);
    setProgress({ phase: "preparing" });
    let submitted = false;
    try {
      const launched = await sdk.launchBoss(quoteState.config, setProgress, (operation) => {
        submitted = true;
        factoryOperation.record(attempt, operation);
      });
      setResult(launched);
      factoryOperation.completeLaunch(attempt, launched);
    } catch (cause) {
      if (cause instanceof FactoryOperationTerminalError || !submitted) factoryOperation.finish(attempt);
      setError(errorMessage(cause));
    } finally {
      busyLockRef.current = false;
      setBusy(undefined);
      factoryOperation.releaseAttempt(attempt);
    }
  }

  async function resumeFactoryOperation() {
    const active = factoryOperation.active;
    if (active?.status !== "submitted" || active.operation.chainId !== BASE_SEPOLIA_CHAIN.id || busyLockRef.current) return;
    if (!factoryOperation.beginRecovery(active.id)) return;
    busyLockRef.current = true;
    setBusy("resume");
    setError(undefined);
    try {
      // Saved transactions belong to their original Factory, even after a manifest upgrade.
      const recoveryReader = createBossFactorySdk({ publicClient, factory: active.operation.factory });
      const resumed = await recoveryReader.resumeOperation(active.operation);
      if (resumed.kind === "launch") {
        setResult(resumed.result);
        factoryOperation.completeLaunch(active.id, resumed.result);
      }
      else if (account && factoryAddress && sameAddressText(factoryAddress, active.operation.factory) &&
          sameAddressText(account, active.operation.account) &&
          sameAddressText(tokenAddressRef.current, resumed.token)) {
        factoryOperation.finish(active.id);
        setAllowance(resumed.allowance ?? await recoveryReader.tokenAllowance(resumed.token, account));
      } else {
        factoryOperation.finish(active.id);
      }
    } catch (cause) {
      if (cause instanceof FactoryOperationTerminalError) factoryOperation.finish(active.id);
      setError(errorMessage(cause));
    } finally {
      busyLockRef.current = false;
      setBusy(undefined);
      factoryOperation.releaseAttempt(active.id);
    }
  }

  const matchingTokenInfo = tokenInfo && sameAddressText(tokenInfo.address, tokenAddress.trim()) ? tokenInfo : undefined;
  const allocationAmount = matchingTokenInfo && parseAmount(allocation, matchingTokenInfo.decimals);
  const hasEnoughBalance = matchingTokenInfo?.balance !== undefined && allocationAmount !== undefined && matchingTokenInfo.balance >= allocationAmount;
  const approvalNeeded = quoteState !== undefined && allowance !== undefined && allowance < quoteState.config.tokenAllocation;
  const factoryLocked = !factoryOperation.ready || factoryOperation.active !== undefined;
  const factoryBuildReady = factoryBuild.status === "compatible";
  const canContinue = Boolean(account && sdk && quoteState && hasEnoughBalance && allowance !== undefined && !factoryLocked && factoryBuildReady);
  const actionLabel = !account
    ? "CONNECT WALLET TO CONTINUE"
    : !factoryBuildReady
      ? factoryBuild.status === "checking" ? "CHECKING FACTORY" : "FACTORY UNAVAILABLE"
    : !quoteState
      ? "GET FUNDING QUOTE FIRST"
      : !hasEnoughBalance
        ? "TOKEN BALANCE TOO LOW"
        : allowance === undefined
          ? "CHECKING TOKEN APPROVAL"
          : approvalNeeded
            ? "APPROVE TOKEN"
            : "LAUNCH BOSS";

  async function continueLaunch() {
    if (approvalNeeded) await approveAllocation();
    else await createBoss();
  }

  const busyLabel = busy === "token" ? "READING TOKEN…"
    : busy === "quote" ? "CALCULATING FUNDING…"
      : busy === "approve" ? "WAITING FOR APPROVAL…"
        : busy === "launch" ? progressLabel(progress)
          : busy === "resume" ? "CHECKING SAVED RECEIPT…"
          : undefined;

  return {
    formOpen, openForm, closeForm, account, walletState, factoryAddress, factoryBuild,
    factoryOperation, result, error, matchingTokenInfo, allocationAmount, hasEnoughBalance,
    quoteState, canContinue, actionLabel, busyLabel, busy, factoryLocked, factoryBuildReady,
    tokenAddress, allocation, prizePercent, volumeTarget,
    editToken(value: string) {
      tokenAddressRef.current = value.trim();
      tokenLoadRequestRef.current++;
      if (busy === "token") setBusy(undefined);
      setTokenAddress(value.trim());
      setTokenInfo(undefined);
      clearQuote();
    },
    editAllocation(value: string) { setAllocation(value); clearQuote(); },
    editPrizePercent(value: string) { setPrizePercent(value); clearQuote(); },
    editVolumeTarget(value: string) { setVolumeTarget(value); clearQuote(); },
    loadToken, requestQuote, continueLaunch, resumeFactoryOperation,
    canResume: Boolean(factoryOperation.active?.status === "submitted" &&
      !factoryOperation.active.live && factoryOperation.active.operation.chainId === BASE_SEPOLIA_CHAIN.id && !busy),
    startAnother: clearQuote,
  };
}

export type BoostPadForm = ReturnType<typeof useBoostPadForm>;

function parseAmount(value: string, decimals: number): bigint | undefined {
  if (!value.trim()) return undefined;
  try {
    return parseStrictUnits(value, decimals);
  } catch {
    return undefined;
  }
}

function progressLabel(progress?: FactoryLaunchProgress): string {
  if (!progress || progress.phase === "preparing") return "PREPARING LAUNCH…";
  if (progress.phase === "mining") return "PREPARING BOSS…";
  if (progress.phase === "submitting") return "WAITING FOR WALLET SIGNATURE…";
  return `WAITING FOR RECEIPT · ${progress.hash.slice(0, 10)}…`;
}

function errorMessage(error: unknown): string {
  if (error instanceof BossFactorySdkError) return error.message;
  if (error && typeof error === "object" && "shortMessage" in error && typeof error.shortMessage === "string") {
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : "The request failed. Check the wallet and network, then try again.";
}
