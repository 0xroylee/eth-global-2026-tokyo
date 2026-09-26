"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BossFactorySdkError,
  FactoryOperationTerminalError,
  createBaseSepoliaPublicClient,
  createBaseSepoliaWalletClient,
  createBossFactorySdk,
  formatUnits,
  isAddress,
  readErc20TokenInfo,
  type Address,
  type Erc20TokenInfo,
  type FactoryLaunchConfig,
  type FactoryLaunchProgress,
  type FactoryLaunchQuote,
  type FactoryLaunchResult,
} from "@boss-pool/chain";
import { WalletControl } from "./WalletControl";
import { useFactoryOperation } from "./FactoryOperationProvider";
import { isCurrentQuoteResponse, isCurrentTokenResponse, parseStrictUnits, sameAddressText } from "@/lib/factory-form";
import { WalletProvider, useWallet } from "@/wallet/WalletProvider";

const BASE_SEPOLIA_RPC_URL =
  process.env.NEXT_PUBLIC_BOSS_POOL_BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
const rawFactoryAddress = process.env.NEXT_PUBLIC_BOSS_FACTORY_BASE_SEPOLIA_ADDRESS;
const factoryAddress = rawFactoryAddress && isAddress(rawFactoryAddress, { strict: false })
  ? rawFactoryAddress as Address
  : undefined;

type LaunchQuoteState = { config: FactoryLaunchConfig; quote: FactoryLaunchQuote };

export function BossFactoryLaunchPage() {
  return (
    <WalletProvider>
      <LaunchForm />
    </WalletProvider>
  );
}

function LaunchForm() {
  const { state: walletState } = useWallet();
  const account = walletState.status === "connected" ? walletState.account : undefined;
  const provider = walletState.status === "connected" ? walletState.selected.provider : undefined;
  const publicClient = useMemo(() => createBaseSepoliaPublicClient(BASE_SEPOLIA_RPC_URL), []);
  const reader = useMemo(
    () => factoryAddress ? createBossFactorySdk({ publicClient, factory: factoryAddress }) : undefined,
    [publicClient],
  );
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
  const [deadlineDays, setDeadlineDays] = useState("7");
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
    const days = Number(deadlineDays);
    if (tokenAllocation < 6n) throw new Error("Allocation must be at least six token base units.");
    if (prizeBps < 1n || prizeBps >= 10_000n) throw new Error("Prize percentage must be greater than 0 and below 100%.");
    if (volumeTargetMockUSD < 6n) throw new Error("MockUSD target must be at least 0.000006.");
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("Deadline must be between 1 and 365 days.");
    return {
      token: tokenInfo.address,
      tokenAllocation,
      prizeBps: Number(prizeBps),
      volumeTargetMockUSD,
      deadline: BigInt(Math.floor(Date.now() / 1000)) + BigInt(days) * 86_400n,
      maxAttackTokenPerMockUSDX128: 0n,
    };
  }

  async function requestQuote() {
    if (!reader) return;
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
    if (!sdk || !quoteState) return;
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
    if (!sdk || !quoteState) return;
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
    if (!reader || active?.status !== "submitted" || busyLockRef.current) return;
    if (!factoryOperation.beginRecovery(active.id)) return;
    busyLockRef.current = true;
    setBusy("resume");
    setError(undefined);
    try {
      const resumed = await reader.resumeOperation(active.operation);
      if (resumed.kind === "launch") {
        setResult(resumed.result);
        factoryOperation.completeLaunch(active.id, resumed.result);
      }
      else if (account && sameAddressText(account, active.operation.account) &&
          sameAddressText(tokenAddressRef.current, resumed.token)) {
        factoryOperation.finish(active.id);
        setAllowance(resumed.allowance ?? await reader.tokenAllowance(resumed.token, account));
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
  const canContinue = Boolean(account && sdk && quoteState && hasEnoughBalance && allowance !== undefined && !factoryLocked);
  const actionLabel = !account
    ? "CONNECT WALLET TO CONTINUE"
    : !quoteState
      ? "GET FUNDING QUOTE FIRST"
      : !hasEnoughBalance
        ? "TOKEN BALANCE TOO LOW"
        : allowance === undefined
          ? "CHECKING TOKEN APPROVAL"
          : approvalNeeded
            ? "APPROVE MEME"
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

  return (
    <main className="h-dvh overflow-y-auto bg-ink text-fog">
      <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-5 sm:px-7 sm:py-7">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <Link href="/" className="font-mono text-[10px] tracking-[0.16em] text-muted transition-colors hover:text-fog">
            ← BACK TO GARDEN HUB
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded-md border border-[#f5b04a]/35 bg-[#f5b04a]/[0.06] px-2 py-1 font-mono text-[9px] tracking-[0.14em] text-[#ffd28a]">
              BASE SEPOLIA · TESTNET
            </span>
            <WalletControl onModalChange={ignoreModalChange} />
          </div>
        </header>

        <div className="grid flex-1 content-center gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.72fr)] lg:gap-12">
          <section className="max-w-2xl">
            <p className="eyebrow">BOSS FACTORY / CREATE</p>
            <h1 className="mt-3 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.055em] sm:text-6xl">
              Turn your MEME into a boss.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted sm:text-base">
              Deposit a token you own, set the prize and volume target, then fund one isolated three-stage boss pool.
            </p>
            {factoryAddress && (
              <p className="mt-3 break-all font-mono text-[9px] tracking-[0.06em] text-faint">
                FACTORY CONTRACT · {factoryAddress}
              </p>
            )}

            <form className="mt-7 space-y-5" onSubmit={(event) => { event.preventDefault(); void requestQuote(); }}>
              <div>
                <label htmlFor="meme-address" className="eyebrow">MEME TOKEN ADDRESS</label>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    id="meme-address"
                    value={tokenAddress}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      tokenAddressRef.current = value;
                      tokenLoadRequestRef.current++;
                      if (busy === "token") setBusy(undefined);
                      setTokenAddress(value);
                      setTokenInfo(undefined);
                      clearQuote();
                    }}
                    placeholder="0x…"
                    autoComplete="off"
                    spellCheck={false}
                    disabled={busy !== undefined || factoryLocked}
                    className="min-w-0 flex-1 rounded-lg border border-white/12 bg-panel px-3 py-3 font-mono text-xs text-fog placeholder:text-faint"
                  />
                  <button
                    type="button"
                    onClick={() => void loadToken()}
                    disabled={busy !== undefined || factoryLocked || !tokenAddress}
                    className="shrink-0 rounded-lg border border-white/12 px-4 py-3 font-mono text-[10px] tracking-[0.12em] text-fog transition-colors hover:bg-white/5 disabled:opacity-40"
                  >
                    {busy === "token" ? "READING…" : "READ TOKEN"}
                  </button>
                </div>
                {matchingTokenInfo && (
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-muted">
                    <span>{matchingTokenInfo.symbol} · {matchingTokenInfo.decimals} decimals</span>
                    <span>Wallet balance · {matchingTokenInfo.balance === undefined ? "checking wallet" : formatUnits(matchingTokenInfo.balance, matchingTokenInfo.decimals)}</span>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="TOTAL MEME ALLOCATION" hint={matchingTokenInfo ? `In ${matchingTokenInfo.symbol} units` : "Read a token first"}>
                  <input
                    aria-label="Total MEME allocation"
                    inputMode="decimal"
                    value={allocation}
                    onChange={(event) => { setAllocation(event.target.value); clearQuote(); }}
                    placeholder="1000000"
                    disabled={!matchingTokenInfo || busy !== undefined || factoryLocked}
                    className={inputClass}
                  />
                </Field>
                <Field label="PRIZE SHARE" hint="Percent of deposited MEME · default 10%">
                  <div className="relative">
                    <input
                      aria-label="Prize percentage"
                      inputMode="decimal"
                      value={prizePercent}
                      onChange={(event) => { setPrizePercent(event.target.value); clearQuote(); }}
                      disabled={busy !== undefined || factoryLocked}
                      className={`${inputClass} pr-10`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center font-mono text-xs text-muted">%</span>
                  </div>
                </Field>
                <Field label="TARGET VOLUME" hint="Eligible MockUSD purchases · stages 1:2:3">
                  <div className="relative">
                    <input
                      aria-label="Target MockUSD volume"
                      inputMode="decimal"
                      value={volumeTarget}
                      onChange={(event) => { setVolumeTarget(event.target.value); clearQuote(); }}
                      disabled={busy !== undefined || factoryLocked}
                      className={`${inputClass} pr-16`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center font-mono text-xs text-muted">MockUSD</span>
                  </div>
                </Field>
                <Field label="ROUND DEADLINE" hint="1 to 365 days from launch">
                  <div className="relative">
                    <input
                      aria-label="Deadline in days"
                      type="number"
                      min="1"
                      max="365"
                      step="1"
                      value={deadlineDays}
                      onChange={(event) => { setDeadlineDays(event.target.value); clearQuote(); }}
                      disabled={busy !== undefined || factoryLocked}
                      className={`${inputClass} pr-14`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center font-mono text-xs text-muted">days</span>
                  </div>
                </Field>
              </div>

              {!factoryAddress && (
                <p className="rounded-lg border border-[#f5b04a]/25 bg-[#f5b04a]/[0.05] px-3 py-2.5 text-xs leading-relaxed text-[#f3d19a]" role="status">
                  Boss Factory is not configured on Base Sepolia yet. Token details remain readable; quotes and launches become available after the Factory is deployed.
                </p>
              )}
              {error && <p className="rounded-lg border border-danger/25 bg-danger/[0.05] px-3 py-2.5 text-xs leading-relaxed text-danger" role="alert">{error}</p>}
              {factoryOperation.storageError && <p className="rounded-lg border border-danger/25 bg-danger/[0.05] px-3 py-2.5 text-xs leading-relaxed text-danger" role="alert">{factoryOperation.storageError}</p>}
              {factoryOperation.active?.status === "preparing" && (
                <p className="rounded-lg border border-[#f5b04a]/25 bg-[#f5b04a]/[0.05] px-3 py-2.5 text-xs leading-relaxed text-[#f3d19a]" role="status">
                  Factory {factoryOperation.active.kind} is in progress for {factoryOperation.active.account ?? "the selected wallet"}. Finish the wallet prompt or wait for confirmation before starting another operation.
                </p>
              )}
              {factoryOperation.active?.status === "submitted" && (
                <div className="rounded-lg border border-[#f5b04a]/25 bg-[#f5b04a]/[0.05] px-3 py-3 text-xs leading-relaxed text-[#f3d19a]" role="status">
                  <p className="font-mono text-[10px] tracking-[0.1em]">{factoryOperation.active.operation.kind === "launch" ? "LAUNCH TRANSACTION PENDING" : "TOKEN APPROVAL PENDING"}</p>
                  <p className="mt-2 break-all">Account · {factoryOperation.active.operation.account}</p>
                  <p className="mt-1 break-all">Transaction · {factoryOperation.active.operation.hash}</p>
                  <a className="mt-2 inline-flex underline underline-offset-4" href={`https://sepolia.basescan.org/tx/${factoryOperation.active.operation.hash}`} target="_blank" rel="noreferrer">View transaction ↗</a>
                  {factoryOperation.active.live && <p className="mt-3">Receipt handling is still active in this tab. Resume becomes available after that request ends.</p>}
                  <button
                    type="button"
                    onClick={() => void resumeFactoryOperation()}
                    disabled={busy !== undefined || factoryOperation.active.live || factoryOperation.active.operation.chainId !== 84532 || !reader}
                    className="mt-3 block min-h-10 w-full rounded-lg border border-[#f5b04a]/45 px-3 py-2 font-mono text-[10px] tracking-[0.12em] text-[#ffd28a] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy === "resume" ? "CHECKING RECEIPT…" : "RESUME RECEIPT CHECK · READ ONLY"}
                  </button>
                </div>
              )}
              {factoryOperation.active?.status === "unreadable" && (
                <p className="rounded-lg border border-danger/25 bg-danger/[0.05] px-3 py-2.5 text-xs leading-relaxed text-danger" role="alert">
                  A saved Factory operation could not be read. The form stays locked to avoid a duplicate. Preserve this browser's local storage and check the transaction manually.
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="submit"
                  disabled={!reader || !matchingTokenInfo || busy !== undefined || factoryLocked}
                  className="min-h-12 flex-1 rounded-lg bg-accent-soft px-4 py-3 font-mono text-[10px] font-medium tracking-[0.13em] text-ink transition-[opacity,transform] hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-opacity motion-reduce:active:scale-100"
                >
                  {busy === "quote" ? "CALCULATING FUNDING…" : "QUOTE LAUNCH"}
                </button>
                <button
                  type="button"
                  onClick={() => void continueLaunch()}
                  disabled={!canContinue || busy !== undefined || !hasEnoughBalance || factoryLocked}
                  className="min-h-12 flex-1 rounded-lg border border-[#f5b04a]/45 px-4 py-3 font-mono text-[10px] font-medium tracking-[0.13em] text-[#ffd28a] transition-[opacity,transform] hover:bg-[#f5b04a]/[0.06] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-opacity motion-reduce:active:scale-100"
                >
                  {busyLabel ?? actionLabel}
                </button>
              </div>
              {busy === "launch" && progress && <p className="font-mono text-[10px] text-muted" role="status">{progressLabel(progress)}</p>}
            </form>
          </section>

          <aside className="self-center rounded-2xl border border-white/10 bg-panel/75 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">FUNDING PREVIEW</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Every launch is quoted on-chain.</h2>
              </div>
              <span className="font-mono text-[9px] tracking-[0.1em] text-dim">READ ONLY</span>
            </div>
            {quoteState ? (
              <dl className="mt-6 space-y-3">
                <QuoteRow label="PRIZE ESCROW" value={`${formatUnits(quoteState.quote.prizeAmount, matchingTokenInfo?.decimals ?? 18)} ${matchingTokenInfo?.symbol ?? "MEME"}`} />
                <QuoteRow label="SALE BUDGET" value={`${formatUnits(quoteState.quote.saleHPBudget, matchingTokenInfo?.decimals ?? 18)} ${matchingTokenInfo?.symbol ?? "MEME"}`} />
                <QuoteRow label="STAGE ONE HP" value={`${formatUnits(quoteState.quote.stageOneHP, matchingTokenInfo?.decimals ?? 18)} ${matchingTokenInfo?.symbol ?? "MEME"}`} />
                <QuoteRow label="ATTACK TOKEN ESTIMATE" value={formatUnits(quoteState.quote.estimatedAttackToken, 18)} />
                <QuoteRow label="BATTLE FUNDING" value={`${formatUnits(quoteState.quote.requiredBattleTokenFunding, matchingTokenInfo?.decimals ?? 18)} ${matchingTokenInfo?.symbol ?? "MEME"}`} />
                <QuoteRow label="START PRICE TICK" value={String(quoteState.quote.hpPriceTick)} />
                <QuoteRow label="ACCEPTED MAX RATE" value={`${formatAttackRate(quoteState.quote.maxRoyPerMockUSDX128)} ATK / MockUSD`} />
                <p className="border-t border-white/8 pt-3 text-xs leading-relaxed text-muted">
                  The quoted maximum attack-token rate is frozen into this launch. The volume gates release stages at 1/6, 1/3, and the remaining target.
                </p>
              </dl>
            ) : (
              <div className="mt-6 rounded-xl border border-white/8 bg-ink/45 p-4">
                <div className="flex items-center justify-between font-mono text-[10px] text-muted"><span>STAGE 01</span><span>1 / 6 VOLUME</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/6 rounded-full bg-accent-soft" /></div>
                <div className="mt-5 flex items-center justify-between font-mono text-[10px] text-muted"><span>STAGE 02</span><span>1 / 3 VOLUME</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 rounded-full bg-[#91e7c5]" /></div>
                <div className="mt-5 flex items-center justify-between font-mono text-[10px] text-muted"><span>STAGE 03</span><span>FINAL VOLUME</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-full rounded-full bg-[#f5b04a]" /></div>
              </div>
            )}

            {matchingTokenInfo && allocationAmount !== undefined && matchingTokenInfo.balance !== undefined && matchingTokenInfo.balance < allocationAmount && (
              <p className="mt-4 text-xs text-danger" role="status">Wallet balance is below the requested allocation.</p>
            )}
            {result && (
              <div className="mt-5 border-t border-live/20 pt-4 text-xs text-live-soft" role="status">
                <p className="font-mono text-[10px] tracking-[0.12em]">BOSS LAUNCHED</p>
                <p className="mt-2 break-all">Boss ID · {result.bossId}</p>
                <p className="mt-1 break-all">Hook · {result.hook}</p>
                <p className="mt-1 break-all">Router · {result.router}</p>
                <a className="mt-3 inline-flex underline underline-offset-4" href={`https://sepolia.basescan.org/tx/${result.hash}`} target="_blank" rel="noreferrer">
                  View transaction ↗
                </a>
              </div>
            )}
            {progress?.phase === "confirming" && !result && (
              <p className="mt-4 break-all border-t border-white/8 pt-3 text-[11px] leading-relaxed text-muted" role="status">
                Transaction sent · {progress.hash.slice(0, 12)}…{" "}
                <a className="text-accent-soft underline underline-offset-4" href={`https://sepolia.basescan.org/tx/${progress.hash}`} target="_blank" rel="noreferrer">
                  Check receipt ↗
                </a>
              </p>
            )}
            <p className="mt-5 text-[11px] leading-relaxed text-faint">
              Launching deposits the full MEME allocation. The prize is paid from this boss's escrow; token transfers and other market activity do not add volume credit.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}

const inputClass = "w-full rounded-lg border border-white/12 bg-panel px-3 py-3 font-mono text-sm text-fog placeholder:text-faint focus:border-accent-soft/50 disabled:opacity-45";

function Field({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="eyebrow">{label}</span>
      <div className="mt-2">{children}</div>
      <span className="mt-1.5 block text-[10px] leading-relaxed text-faint">{hint}</span>
    </label>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/6 pb-2">
      <dt className="font-mono text-[9px] tracking-[0.08em] text-dim">{label}</dt>
      <dd className="text-right font-mono text-xs text-fog">{value}</dd>
    </div>
  );
}

function parseAmount(value: string, decimals: number): bigint | undefined {
  if (!value.trim()) return undefined;
  try {
    return parseStrictUnits(value, decimals);
  } catch {
    return undefined;
  }
}

function formatAttackRate(rate: bigint): string {
  const displayed = rate / (1n << 128n);
  return formatUnits(displayed, 12);
}

function progressLabel(progress?: FactoryLaunchProgress): string {
  if (!progress || progress.phase === "preparing") return "PREPARING LAUNCH…";
  if (progress.phase === "mining") return `FINDING VALID HOOK ADDRESS · ${progress.attempts.toLocaleString()} SALTS CHECKED`;
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

function ignoreModalChange() {}
