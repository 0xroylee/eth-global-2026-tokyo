"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  RequoteRequiredError,
  type ApprovalAction,
  type ApprovalStatus,
  type AttackQuote,
  type AttackResult,
  type RewardPreview,
} from "@boss-pool/chain";
import { displayAmount, displayEstimate, roundStatusLabel } from "@/lib/format";
import { writeStateMatchesEncounter } from "@/lib/battle";
import { ATTACK_CAPS, attackCapAmount, routeAttackCommand, type AttackCap } from "@/lib/attackCommand";
import { pollAttackQuotes } from "@/lib/attackQuotes";
import { type useBossPool } from "@/lib/useBossPool";
import { BattleDetails } from "./battle/BattleDetails";

type Arena = ReturnType<typeof useBossPool>;
type QuoteState = {
  quote: AttackQuote;
  network: Arena["network"];
  account?: string;
  walletChainId?: number;
  deploymentTxHash: string;
  hookAddress: string;
  stageSold: bigint;
  stageVolume: bigint;
  bossPrice: bigint;
  receivedAt: number;
};
type ActionResult =
  | { kind: "approval"; hash: string; token: string; spender: string; amount: bigint; attackCap?: bigint }
  | { kind: "attack"; hash: string; maxMockUSD: bigint; result: AttackResult }
  | { kind: "reward"; hash: string; hpAmount: bigint; payout: bigint }
  | { kind: "nft"; hash: string; tokenId: bigint };

const MOCK_USD_DECIMALS = 6;
const DEFAULT_SLIPPAGE_BPS = 100;

export type AttackQuotePreview = {
  quote: AttackQuote | null;
  quotes: Partial<Record<AttackCap, AttackQuote>>;
  errors: Partial<Record<AttackCap, string>>;
  fresh: boolean;
  loading: boolean;
  allowanceLoading: boolean;
  error: string | null;
  allowanceMissing: boolean;
  hasInputBalance: boolean;
  ready: boolean;
  playerReady: boolean;
  allowanceReady: boolean;
  outputSymbol: string;
  outputDecimals: number;
};

export type BossActionsHandle = { attackOrRequestApproval: (cap: AttackCap) => void };

type BossActionsProps = {
  arena: Arena;
  selectedCap: AttackCap;
  approvalOnly: boolean;
  onApprovalRequired: () => void;
  onApprovalReady: () => void;
  onQuotePreviewChange: (preview: AttackQuotePreview) => void;
};

export const BossActions = forwardRef<BossActionsHandle, BossActionsProps>(function BossActions({
  arena,
  selectedCap,
  approvalOnly,
  onApprovalRequired,
  onApprovalReady,
  onQuotePreviewChange,
}, ref) {
  const [quoteStates, setQuoteStates] = useState<Partial<Record<AttackCap, QuoteState>>>({});
  const [quoteErrors, setQuoteErrors] = useState<Partial<Record<AttackCap, string>>>({});
  const quoteState = quoteStates[selectedCap] ?? null;
  const quoteError = quoteErrors[selectedCap] ?? null;
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [claimText, setClaimText] = useState("");
  const [rewardPreview, setRewardPreview] = useState<RewardPreview | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<{ attack?: ApprovalStatus; claim?: ApprovalStatus }>({});
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [now, setNow] = useState(Date.now());
  const [quoteRefreshVersion, setQuoteRefreshVersion] = useState(0);
  const expiredQuoteKey = useRef<string | null>(null);

  const live = arena.deployment.kind === "live" ? arena.deployment : null;
  const sdk = arena.sdk;
  const account = arena.wallet.account;
  const player = live?.player;
  const round = live?.round;
  const factory = round?.encounterMode === "factory";
  const hpToken = round?.hpToken;
  const rewardToken = round?.rewardToken;
  const claimToken = factory ? rewardToken : hpToken;
  const claimableAmount = player ? factory ? player.rewardCredit : player.bossHPBalance : 0n;
  const inputAmount = attackCapAmount(selectedCap);
  const attackCommandLabel = selectedCap === 1 ? "SWAP ATTACK" : `${selectedCap}× SWAP ATTACK`;
  const approvalActionLabel = `Approve unlimited MockUSD allowance · ${selectedCap} MockUSD attack cap`;
  const hpAmount = parseTokenAmount(claimText, claimToken?.decimals ?? 18);
  const attackAllowance = player?.attackAllowance;
  const claimAllowance = player?.claimAllowance;
  const heldBossHP = player?.bossHPBalance;
  const rewardCredit = player?.rewardCredit;
  const eligibleHP = round?.finalEligibleHP;
  const redeemedHP = round?.redeemedHP;
  const originalPrize = round?.originalPrize;
  const writeBusy = arena.writeState.status === "prompting" || arena.writeState.status === "pending" || arena.writeState.status === "unresolved";
  const writeMatches = writeStateMatchesEncounter(arena.writeState, arena.network,
    live?.hookAddress ?? arena.selectedHookAddress ?? arena.requestedHookAddress);
  const claimInputError = claimText.length > 0 && hpAmount === null ? `Enter a ${claimToken?.symbol ?? "token"} amount with up to ${claimToken?.decimals ?? 18} decimal places.` : null;
  const chainTimestamp = round?.blockTimestamp ?? 0n;
  const observedTimestamp = round && live
    ? round.blockTimestamp + BigInt(Math.max(0, Math.floor((now - live.readAt) / 1_000)))
    : chainTimestamp;
  const active = Boolean(round && round.status === 1 && (round.deadline === 0n || observedTimestamp < round.deadline));
  const quoteTimestamp = quoteState
    ? quoteState.quote.quotedAt + BigInt(Math.max(0, Math.floor((now - quoteState.receivedAt) / 1_000)))
    : chainTimestamp;
  const defeated = round?.status === 3;
  const quoteStage = round?.currentStage;
  const quoteStageSold = quoteStage === undefined ? undefined : round?.stageSold[quoteStage];
  const quoteStageVolume = quoteStage === undefined ? undefined : round?.stageVolume[quoteStage];
  const quoteBossPrice = round?.bossCurrentSqrtPriceX96;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setApprovals({});
    setRewardPreview(null);
    setRewardError(null);
    if (!sdk || !account) {
      setApprovalLoading(false);
      return;
    }
    let activeRequest = true;
    let retryTimer: number | undefined;
    let retry = 0;
    const readApprovals = async () => {
      setApprovalLoading(true);
      const attackRequest = sdk.getApproval({ kind: "attack", maxMockUSD: attackCapAmount(10) }, account);
      const claimRequest = hpAmount !== null && hpAmount > 0n && defeated && !factory
        ? sdk.getApproval({ kind: "claimReward", hpAmount }, account)
        : Promise.resolve(undefined);
      const [attackResult, claimResult] = await Promise.allSettled([attackRequest, claimRequest]);
      if (!activeRequest) return;
      const attack = attackResult.status === "fulfilled" ? attackResult.value : undefined;
      const claim = claimResult.status === "fulfilled" ? claimResult.value : undefined;
      setApprovals({ attack, claim });
      setApprovalLoading(false);
      if (attackResult.status === "rejected" || claimResult.status === "rejected") {
        const retryDelays = [2_000, 5_000, 15_000, 30_000];
        const delay = retryDelays[Math.min(retry, retryDelays.length - 1)];
        retry += 1;
        retryTimer = window.setTimeout(() => void readApprovals(), delay);
      } else {
        retry = 0;
      }
    };
    void readApprovals();

    if (hpAmount !== null && hpAmount > 0n && defeated) {
      void sdk.previewReward(hpAmount, account).then((preview) => {
        if (activeRequest) setRewardPreview(preview);
      }).catch((error: unknown) => {
        if (activeRequest) setRewardError(errorMessage(error));
      });
    }
    return () => {
      activeRequest = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [sdk, account, hpAmount, defeated, factory, attackAllowance, claimAllowance, heldBossHP, rewardCredit, eligibleHP, redeemedHP, originalPrize]);

  const freshQuotes = useMemo(() => {
    const quotes: Partial<Record<AttackCap, AttackQuote>> = {};
    if (!live || !round || !active) return quotes;
    for (const cap of ATTACK_CAPS) {
      const state = quoteStates[cap];
      if (!state) continue;
      const { quote } = state;
      const timestamp = quote.quotedAt + BigInt(Math.max(0, Math.floor((now - state.receivedAt) / 1_000)));
      if (state.network === arena.network &&
        state.hookAddress.toLowerCase() === live.hookAddress.toLowerCase() &&
        state.deploymentTxHash.toLowerCase() === live.manifest.deploymentTxHash.toLowerCase() &&
        state.account?.toLowerCase() === account?.toLowerCase() &&
        state.walletChainId === arena.wallet.chainId &&
        quote.chainId === live.manifest.chainId &&
        quote.stage === round.currentStage &&
        round.stageSold[quote.stage] === state.stageSold &&
        round.stageVolume[quote.stage] === state.stageVolume &&
        round.bossCurrentSqrtPriceX96 === state.bossPrice &&
        quote.maxMockUSD === attackCapAmount(cap) &&
        chainTimestamp < quote.expiresAt && timestamp < quote.expiresAt) quotes[cap] = quote;
    }
    return quotes;
  }, [quoteStates, live, round, arena.network, arena.wallet.chainId, account, chainTimestamp, now, active]);
  const quoteFresh = Boolean(freshQuotes[selectedCap]);
  const quoteBusy = active && !quoteFresh && !quoteError;
  const selectedQuoteState = quoteState?.quote.maxMockUSD === inputAmount ? quoteState : null;

  const quoteSecondsLeft = quoteState && live
    ? Math.max(0, Number(quoteState.quote.expiresAt - quoteTimestamp))
    : 0;
  const attackApproval = approvals.attack ? {
    ...approvals.attack,
    requiredAllowance: inputAmount,
    approvalNeeded: approvals.attack.currentAllowance < inputAmount,
  } : undefined;
  const claimApproval = approvals.claim;
  const hasInputBalance = Boolean(player && inputAmount !== null && inputAmount > 0n && player.mockUSDBalance >= inputAmount);
  const attackReady = Boolean(
    sdk && account && arena.canWrite && !arena.networkMismatch && active && hasInputBalance &&
    quoteFresh && attackApproval && !attackApproval.approvalNeeded && !writeBusy && !arena.pendingRecord,
  );
  const approvalCanContinue = Boolean(
    sdk && account && arena.canWrite && !arena.networkMismatch && active && hasInputBalance &&
    quoteFresh && attackApproval?.approvalNeeded && !writeBusy && !arena.pendingRecord,
  );

  useEffect(() => {
    setQuoteStates({});
    setQuoteErrors({});
    if (writeBusy || arena.pendingRecord) return;
    if (!sdk || !live || !round || !active ||
      quoteStage === undefined || quoteStageSold === undefined || quoteStageVolume === undefined || quoteBossPrice === undefined) {
      return;
    }

    const context = {
      network: arena.network,
      account,
      walletChainId: arena.wallet.chainId,
      deploymentTxHash: live.manifest.deploymentTxHash,
      hookAddress: live.hookAddress,
      stage: quoteStage,
      stageSold: quoteStageSold,
      stageVolume: quoteStageVolume,
      bossPrice: quoteBossPrice,
    };

    return pollAttackQuotes(
      (cap) => sdk.quoteAttack({
        maxMockUSD: attackCapAmount(cap),
        stage: context.stage,
        account,
        slippageBps: DEFAULT_SLIPPAGE_BPS,
      }),
      (cap, quote, requestedAt) => {
        setQuoteStates((previous) => ({ ...previous, [cap]: { quote, ...context, receivedAt: requestedAt } }));
        setQuoteErrors((previous) => ({ ...previous, [cap]: undefined }));
      },
      (cap, error) => setQuoteErrors((previous) => ({ ...previous, [cap]: errorMessage(error) })),
    );
  }, [sdk, live?.hookAddress, live?.manifest.deploymentTxHash, round?.status, active,
    arena.network, account, arena.wallet.chainId, quoteStage, quoteStageSold, quoteStageVolume, quoteBossPrice,
    writeBusy, arena.pendingRecord, quoteRefreshVersion]);

  useEffect(() => {
    onQuotePreviewChange({
      quote: selectedQuoteState?.quote ?? null,
      quotes: freshQuotes,
      errors: quoteErrors,
      fresh: quoteFresh,
      loading: quoteBusy,
      allowanceLoading: approvalLoading,
      error: quoteError,
      allowanceMissing: Boolean(attackApproval?.approvalNeeded),
      hasInputBalance,
      ready: attackReady,
      playerReady: Boolean(player),
      allowanceReady: Boolean(attackApproval),
      outputSymbol: hpToken?.symbol ?? "HP",
      outputDecimals: hpToken?.decimals ?? 18,
    });
  }, [onQuotePreviewChange, selectedQuoteState?.quote, freshQuotes, quoteErrors, quoteFresh, quoteBusy, quoteError, attackApproval?.approvalNeeded,
    Boolean(attackApproval), approvalLoading, hasInputBalance, attackReady, Boolean(player), hpToken?.symbol, hpToken?.decimals]);

  useEffect(() => {
    if (!quoteState || chainTimestamp < quoteState.quote.expiresAt) {
      expiredQuoteKey.current = null;
      return;
    }
    const key = `${arena.network}:${live?.hookAddress.toLowerCase() ?? ""}:${quoteState.quote.expiresAt}`;
    if (expiredQuoteKey.current === key) return;
    expiredQuoteKey.current = key;
    setQuoteRefreshVersion((version) => version + 1);
  }, [quoteState?.quote.expiresAt, chainTimestamp, arena.network, live?.hookAddress]);

  useEffect(() => {
    if (approvalOnly && quoteFresh && attackApproval && !attackApproval.approvalNeeded) onApprovalReady();
  }, [approvalOnly, quoteFresh, attackApproval, onApprovalReady]);

  async function submitApproval(action: ApprovalAction, label: string) {
    if (!sdk || (action.kind === "attack" && action.maxMockUSD !== inputAmount)) return;
    try {
      const confirmed = await arena.runPending(label, () => sdk.approve(action), "approval");
      if (confirmed?.status === "confirmed") {
        setLastResult({
          kind: "approval",
          hash: confirmed.hash,
          token: confirmed.result.token,
          spender: confirmed.result.spender,
          amount: confirmed.result.amount,
          attackCap: action.kind === "attack" ? action.maxMockUSD : undefined,
        });
      }
    } catch {
      // The shared write status retains rejection, requote, and receipt errors.
    }
  }

  async function claimReward() {
    if (!sdk || hpAmount === null || hpAmount <= 0n || !account) return;
    try {
      const confirmed = await arena.runPending("Claim encounter reward", () => sdk.claimReward(hpAmount), "claimReward");
      if (confirmed?.status === "confirmed") {
        setLastResult({ kind: "reward", hash: confirmed.hash, hpAmount: confirmed.result.hpAmount, payout: confirmed.result.payout });
      }
    } catch (error) {
      if (error instanceof RequoteRequiredError) setRewardError(error.message);
    }
  }

  async function claimVictoryNFT() {
    if (!sdk) return;
    try {
      const confirmed = await arena.runPending("Claim victory NFT", () => sdk.claimVictoryNFT(), "claimVictoryNFT");
      if (confirmed?.status === "confirmed") {
        setLastResult({ kind: "nft", hash: confirmed.hash, tokenId: confirmed.result.tokenId });
      }
    } catch {
      // The shared write status retains the decoded contract error.
    }
  }

  async function attack(cap: AttackCap = selectedCap) {
    const quote = freshQuotes[cap];
    if (!sdk || !quote || quote.maxMockUSD !== attackCapAmount(cap)) return;
    setQuoteErrors((previous) => ({ ...previous, [cap]: undefined }));
    try {
      const label = cap === 1 ? "SWAP ATTACK" : `${cap}× SWAP ATTACK`;
      const confirmed = await arena.runPending(label, () => sdk.attack(quote), "attack");
      if (confirmed?.status === "confirmed") {
        setLastResult({ kind: "attack", hash: confirmed.hash, maxMockUSD: quote.maxMockUSD, result: confirmed.result });
      }
    } catch (error) {
      if (error instanceof RequoteRequiredError) {
        setQuoteStates((previous) => ({ ...previous, [cap]: undefined }));
        setQuoteErrors((previous) => ({ ...previous, [cap]: error.message }));
        setQuoteRefreshVersion((version) => version + 1);
      }
    }
  }

  useImperativeHandle(ref, () => ({
    attackOrRequestApproval(requestedCap) {
      const requestedMaxMockUSD = attackCapAmount(requestedCap);
      const quote = freshQuotes[requestedCap];
      const walletReady = Boolean(sdk && account && arena.canWrite && !arena.networkMismatch && active &&
        player && player.mockUSDBalance >= requestedMaxMockUSD && !writeBusy && !arena.pendingRecord);
      const allowanceMissing = Boolean(approvals.attack && approvals.attack.currentAllowance < requestedMaxMockUSD);
      const route = routeAttackCommand({
        quoteFresh: Boolean(quote),
        quoteMaxMockUSD: quote?.maxMockUSD ?? null,
        selectedMaxMockUSD: requestedMaxMockUSD,
        attackReady: walletReady && Boolean(approvals.attack) && !allowanceMissing,
        allowanceMissing,
        approvalReady: walletReady && allowanceMissing,
      });
      if (route === "attack") void attack(requestedCap);
      else if (route === "approval") onApprovalRequired();
    },
  }));

  const attackBlockReason = !account
    ? "Connect a wallet before attacking. The quote remains public."
    : arena.networkMismatch
      ? `Switch the wallet to ${arena.network === "local" ? "local chain 31337" : "Base Sepolia 84532"}.`
      : !active
        ? round?.status === 3 ? "The boss has been defeated." : round?.status === 4 ? "This round has expired." : "Attack is unavailable outside an active round."
        : !hasInputBalance
          ? `The wallet needs enough MockUSD for up to ${selectedCap} MockUSD; unused input is refunded.`
          : !quoteState
            ? quoteBusy ? "The public attack quote is loading." : "The public attack quote is unavailable; it will retry automatically."
            : !quoteFresh
              ? "This quote is stale. Wait for the refreshed preview before attacking."
              : attackApproval?.approvalNeeded
                ? `Approve MockUSD for BossRouter before ${attackCommandLabel}.`
                : `Ready to submit the quoted ${attackCommandLabel}.`;

  if (approvalOnly) {
    return (
      <div className="font-system text-sm leading-relaxed text-[#2b4a8b]">
        <p>BossRouter needs permission to spend MockUSD before this {attackCommandLabel}.</p>
        <dl className="mt-3 grid gap-1 border-y border-[#2b4a8b]/25 py-2 text-xs">
          <div className="flex justify-between gap-3"><dt>Token</dt><dd>MockUSD</dd></div>
          <div className="flex justify-between gap-3"><dt>Spender</dt><dd className="font-semibold">BossRouter</dd></div>
          <div className="flex justify-between gap-3"><dt>Permission</dt><dd>Unlimited</dd></div>
          <div className="flex justify-between gap-3"><dt>Attack cap</dt><dd>Up to {displayAmount(inputAmount, MOCK_USD_DECIMALS)} MockUSD</dd></div>
        </dl>
        <p className="mt-3">1. Approve MockUSD in your wallet. 2. When this closes, click the selected command to send the quoted attack.</p>
        <p className="mt-1 text-xs">Approval never sends an attack.</p>
        {live && <details className="mt-2 text-xs">
          <summary className="cursor-pointer">Show full token and spender addresses</summary>
          <dl className="mt-1 grid gap-1 break-all">
            <div><dt className="inline">MockUSD: </dt><dd className="inline">{live.manifest.addresses.mockUSD}</dd></div>
            <div><dt className="inline">BossRouter: </dt><dd className="inline">{live.manifest.addresses.router}</dd></div>
          </dl>
        </details>}
        {!quoteFresh && <p className="mt-2 text-xs text-[#a14845]" role="status">Refreshing the public quote. Approval will be ready when it is fresh.</p>}
        {!attackApproval && <p className="mt-2 text-xs" role="status">{approvalLoading ? "Reading the current allowance…" : "Allowance is unavailable · retrying automatically."}</p>}
        {attackApproval?.approvalNeeded && <button
          type="button"
          disabled={!approvalCanContinue}
          onClick={() => void submitApproval({ kind: "attack", maxMockUSD: inputAmount }, approvalActionLabel)}
          className="mt-3 min-h-11 border-2 border-[#2b4a8b] bg-[#2b4a8b] px-4 py-2 font-pixel text-xs text-white shadow-[3px_3px_0_rgba(20,30,60,.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ab4ff] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {writeBusy ? "Approval in progress…" : !quoteFresh ? "Waiting for fresh quote…" : "Approve MockUSD"}
        </button>}
        {writeMatches && arena.writeState.status !== "idle" && <ApprovalWriteStatus state={arena.writeState} />}
        {writeBusy && !writeMatches && <p className="mt-3 text-xs" role="status">A wallet action for another boss is still in progress.</p>}
        {arena.pendingRecord && <div className="mt-2"><p className="text-xs">A submitted transaction must be checked before another write.</p><button type="button" className="mt-2 min-h-11 border-2 border-[#2b4a8b] px-3 py-2 text-xs disabled:opacity-50" disabled={arena.writeState.status === "pending" || arena.writeState.status === "prompting"} onClick={() => void arena.resumePending()}>Check saved transaction</button></div>}
      </div>
    );
  }

  return (
    <div className="font-system text-sm leading-relaxed text-[#2b4a8b]">
      {round && <>
        <BattleDetails round={round} quote={freshQuotes[1] ?? null} priceStatus={!active ? "Attacks are closed. No current exchange quote." : quoteErrors[1] ? "Price unavailable. The quote will retry automatically." : "Refreshing the current exchange rate…"} />
        <p className="mt-3 text-xs">{round.deadline === 0n ? "Battle stays open until defeated." : `Deadline: ${formatUtc(round.deadline)}`}</p>
      </>}

      {!defeated && <details className="mt-4 border-y border-[#2b4a8b]/25 py-2" open={!round}>
        <summary className="min-h-11 cursor-pointer py-3 font-pixel text-[11px]">Attack quote details</summary>
        <section aria-labelledby="quote-heading" className="pb-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-pixel text-[10px]">STEP 01 · PUBLIC PREVIEW</p>
            <h3 id="quote-heading" className="mt-1 text-base font-medium">Automatic public quote</h3>
          </div>
          <span className="font-system text-[9px] tracking-[0.1em] text-[#405b88]">NO WALLET OR ALLOWANCE NEEDED</span>
        </div>
        <p className="mt-3 text-sm text-[#2b4a8b]">Selected cap: up to {selectedCap} MockUSD · damage is estimated from the live quote and can vary with pool prices.</p>
        <p className="mt-1 text-xs text-[#405b88]">All attack quotes load in advance and refresh every 30 seconds, or when the stage, pool, or wallet changes.</p>
        {arena.deployment.kind === "not-deployed" && <p className="mt-2 text-xs text-[#405b88]">No deployment manifest exists for this network, so no quote is available.</p>}
        {arena.deployment.kind === "error" && <p className="mt-2 text-xs text-[#a14845]" role="status">Public quote unavailable: {arena.deployment.message}</p>}
        {round && !active && !quoteError && (
          <p className="mt-2 text-xs text-[#405b88]" role="status">
            {round.status === 3
              ? "This deployment's round is already defeated; an attack quote is unavailable."
              : round.status === 4 || (round.deadline !== 0n && chainTimestamp >= round.deadline)
                ? "This round has expired by its on-chain deadline; attack quotes are closed."
                : `Attack quotes require an Active round. Current status: ${roundStatusLabel(round.status)}.`}
          </p>
        )}
        {quoteError && <p className="mt-2 text-xs text-[#a14845]" role="alert">Quote or simulation failed: {quoteError}</p>}
        {selectedQuoteState && (
          <div className={`mt-3 border-l-2 pl-3 ${quoteFresh ? "border-[#286b36]" : "border-[#a14845]"}`} aria-live="polite">
            <p className={`font-system text-[9px] tracking-[0.1em] ${quoteFresh ? "text-[#286b36]" : "text-[#a14845]"}`}>
              {quoteFresh ? "FRESH QUOTE" : "QUOTE STALE · REFRESHING AUTOMATICALLY"}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
              <QuoteMetric label={`${hpToken?.symbol ?? "TOKEN"} ESTIMATE`} amount={selectedQuoteState.quote.bossHPOut} decimals={hpToken?.decimals ?? 18} unit={hpToken?.symbol ?? "HP"} />
              <QuoteMetric label="MOCKUSD SPENT" amount={selectedQuoteState.quote.mockUSDSpent} decimals={MOCK_USD_DECIMALS} unit="mUSD" />
              <QuoteMetric label="MOCKUSD REFUND" amount={selectedQuoteState.quote.mockUSDRefunded} decimals={MOCK_USD_DECIMALS} unit="mUSD" />
              <QuoteMetric label="ATTACK TOKEN BOUGHT" amount={selectedQuoteState.quote.royBought} decimals={18} unit="Attack Token" />
              <QuoteMetric label="ATTACK TOKEN SPENT" amount={selectedQuoteState.quote.roySpent} decimals={18} unit="Attack Token" />
              <QuoteMetric label="ATTACK TOKEN REFUND" amount={selectedQuoteState.quote.royRefunded} decimals={18} unit="Attack Token" />
            </div>
            <div className="mt-2 text-xs text-[#405b88]">
              {selectedQuoteState.quote.bossDefeated
                ? "This attack is predicted to defeat the boss."
                : selectedQuoteState.quote.stageCleared
                  ? `This attack is predicted to clear Stage ${selectedQuoteState.quote.stage + 1} and open Stage ${selectedQuoteState.quote.nextStage + 1}.`
                  : `Stage ${selectedQuoteState.quote.stage + 1} remains active.`}
              <span
                className="ml-2 text-[#405b88]"
                title={`Exact floors: ${displayAmount(selectedQuoteState.quote.minRoyOut, 18)} Attack Token and ${displayAmount(selectedQuoteState.quote.minBossHPOut, hpToken?.decimals ?? 18)} ${hpToken?.symbol ?? "HP"}`}
              >
                Min ≈ {displayEstimate(selectedQuoteState.quote.minRoyOut, 18)} Attack Token + {displayEstimate(selectedQuoteState.quote.minBossHPOut, hpToken?.decimals ?? 18)} {hpToken?.symbol ?? "HP"} · block {selectedQuoteState.quote.quotedBlock.toString()}
              </span>
            </div>
            <details className="mt-2 text-[10px] text-[#405b88]">
              <summary className="min-h-11 cursor-pointer py-3 font-system tracking-[0.08em]">EXACT DECIMAL VALUES</summary>
              <dl className="mt-1 grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
                <ExactValue label={`${hpToken?.symbol ?? "Token"} output`} amount={selectedQuoteState.quote.bossHPOut} decimals={hpToken?.decimals ?? 18} unit={hpToken?.symbol ?? "HP"} />
                <ExactValue label="MockUSD spent" amount={selectedQuoteState.quote.mockUSDSpent} decimals={MOCK_USD_DECIMALS} unit="mUSD" />
                <ExactValue label="MockUSD refund" amount={selectedQuoteState.quote.mockUSDRefunded} decimals={MOCK_USD_DECIMALS} unit="mUSD" />
                <ExactValue label="Attack Token bought" amount={selectedQuoteState.quote.royBought} decimals={18} unit="Attack Token" />
                <ExactValue label="Attack Token spent" amount={selectedQuoteState.quote.roySpent} decimals={18} unit="Attack Token" />
                <ExactValue label="Attack Token refund" amount={selectedQuoteState.quote.royRefunded} decimals={18} unit="Attack Token" />
                <ExactValue label="Minimum Attack Token output" amount={selectedQuoteState.quote.minRoyOut} decimals={18} unit="Attack Token" />
                <ExactValue label={`Minimum ${hpToken?.symbol ?? "HP"} output`} amount={selectedQuoteState.quote.minBossHPOut} decimals={hpToken?.decimals ?? 18} unit={hpToken?.symbol ?? "HP"} />
              </dl>
            </details>
            <p className="mt-1 font-system text-[9px] text-[#405b88]">
              {quoteFresh ? `${quoteSecondsLeft}s remaining` : "Waiting for the automatic quote refresh"} · 1% output tolerance
            </p>
            <p className="mt-1 text-xs text-[#405b88]">
              Supply pool fee: {selectedQuoteState.quote.supplyPoolFee / 10_000}% · Boss pool fee: {selectedQuoteState.quote.bossPoolFee / 10_000}%
            </p>
          </div>
        )}
        </section>
      </details>}

      <div className="border-[#2b4a8b]/25 my-4 border-t" />

      <section aria-labelledby="readiness-heading">
        <p className="font-pixel text-[10px]">PLAYER READINESS</p>
        <h3 id="readiness-heading" className="mt-1 text-base font-medium">Complete these actions in order</h3>
        {!account ? (
          <p className="mt-2 text-xs leading-relaxed text-[#405b88]">Connect a wallet to attack or claim. Public round reads and quotes work without a wallet.</p>
        ) : !player ? (
          <p className="mt-2 text-xs text-[#405b88]">Reading this account on the selected network…</p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="break-words text-[11px] leading-relaxed text-[#405b88]">
              {displayAmount(player.mockUSDBalance, MOCK_USD_DECIMALS)} mUSD · {displayAmount(player.royBalance, 18)} Attack Token · {displayAmount(player.bossHPBalance, hpToken?.decimals ?? 18)} {hpToken?.symbol ?? "HP"}{factory ? ` · ${displayAmount(player.rewardCredit, rewardToken?.decimals ?? 18)} reward credit` : ""} · {displayAmount(player.nativeBalance, 18)} ETH gas
              <span className="ml-2">{player.hasAttacked ? "ATTACKED" : "NO ATTACK YET"}</span>
            </p>
            {!defeated && <><ReadinessRow step="A" title="Router allowance" state={!quoteState ? "waiting" : !quoteFresh ? "stale" : attackApproval?.approvalNeeded ? "needed" : "ready"}>
              {!quoteState ? <p className="text-xs text-[#405b88]">The public quote loads automatically before approval or attack.</p> : (
                <>
                  {attackApproval && (
                    <p className="text-xs text-[#405b88]">
                      Current allowance: {displayAmount(attackApproval.currentAllowance, MOCK_USD_DECIMALS)} mUSD
                    </p>
                  )}
                  <p className="mt-1 break-all font-system text-[9px] text-[#405b88]">
                    MockUSD {live ? shortAddress(live.manifest.addresses.mockUSD) : "—"} → BossRouter {live ? shortAddress(live.manifest.addresses.router) : "—"} · unlimited approval
                  </p>
                  {quoteFresh && selectedQuoteState && attackApproval?.approvalNeeded && (
                    <ActionButton disabled={!hasInputBalance || !arena.canWrite || arena.networkMismatch || writeBusy || Boolean(arena.pendingRecord)} onClick={() => void submitApproval({ kind: "attack", maxMockUSD: selectedQuoteState.quote.maxMockUSD }, approvalActionLabel)}>
                      Approve MockUSD for BossRouter
                    </ActionButton>
                  )}
                  {!quoteFresh && <p className="mt-1 text-xs text-[#a14845]">Waiting for a fresh quote. Bounds from an earlier stage, amount, account, chain, or deployment cannot be used.</p>}
                </>
              )}
            </ReadinessRow>

            <ReadinessRow step="B" title="Attack" state={attackReady ? "ready" : active ? "waiting" : "closed"}>
              <p className="text-xs leading-relaxed text-[#405b88]" role="status">{attackBlockReason}</p>
              <ActionButton primary disabled={!attackReady} onClick={() => void attack()}>
                {attackCommandLabel} · STAGE {round ? round.currentStage + 1 : "—"}
              </ActionButton>
            </ReadinessRow>
            </>}
          </div>
        )}
      </section>

      {defeated && account && player && (
        <>
          <div className="border-[#2b4a8b]/25 my-4 border-t" />
          <section aria-labelledby="reward-heading">
            <p className="font-pixel text-[10px]">POST-DEFEAT CLAIMS</p>
            <h3 id="reward-heading" className="mt-1 text-base font-medium">Reward rights and victory NFT are separate</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="font-system text-[9px] tracking-[0.1em] text-[#405b88]">{factory ? "ATTACK REWARD CREDIT" : "TRANSFERABLE HP REWARD RIGHTS"}</p>
                <p className="mt-1 text-xs text-[#405b88]">{factory
                  ? `This wallet has ${displayAmount(claimableAmount, claimToken?.decimals ?? 18)} ${claimToken?.symbol ?? "MEME"} reward credit. Claiming credit leaves purchased MEME in the wallet.`
                  : `Wallet holds ${displayAmount(claimableAmount, claimToken?.decimals ?? 18)} ${claimToken?.symbol ?? "BossHP"}. No attack history is required to redeem transferred HP.`}</p>
                {claimableAmount > 0n && (
                  <>
                    <label htmlFor="reward-hp-amount" className="mt-2 block text-xs text-[#405b88]">{factory ? `${claimToken?.symbol ?? "MEME"} credit to claim` : `${claimToken?.symbol ?? "BossHP"} to surrender`}</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id="reward-hp-amount"
                        value={claimText}
                        onChange={(event) => setClaimText(event.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-invalid={Boolean(claimInputError)}
                        className="min-w-0 flex-1 border border-[#2b4a8b]/40 bg-[#fff9e9] px-2.5 py-2 font-system text-xs text-[#2b4a8b] focus:border-[#2b4a8b]"
                      />
                      <button type="button" className="min-h-11 border border-[#2b4a8b]/40 px-2 text-[9px] text-[#405b88]" onClick={() => setClaimText(displayAmount(claimableAmount, claimToken?.decimals ?? 18))}>
                        MAX
                      </button>
                    </div>
                    {claimInputError && <p className="mt-1 text-xs text-[#a14845]" role="alert">{claimInputError}</p>}
                    {rewardError && <p className="mt-1 text-xs text-[#a14845]" role="status">{rewardError}</p>}
                    {rewardPreview && <p className="mt-1 text-xs text-[#286b36]">Estimated payout: {displayAmount(rewardPreview.payout, rewardToken?.decimals ?? 18)} {rewardToken?.symbol ?? "reward token"}</p>}
                    {!factory && claimApproval && (
                      <p className="mt-1 break-all font-system text-[9px] text-[#405b88]">
                        {claimToken?.symbol ?? "BossHP"} {shortAddress(claimApproval.tokenAddress)} → BossHook {shortAddress(claimApproval.spenderAddress)} · unlimited approval
                      </p>
                    )}
                    {factory ? (
                      <ActionButton disabled={!arena.canWrite || arena.networkMismatch || writeBusy || Boolean(arena.pendingRecord) || !rewardPreview?.claimable} onClick={() => void claimReward()}>
                        Claim reward credit
                      </ActionButton>
                    ) : claimApproval?.approvalNeeded ? (
                      <ActionButton disabled={!arena.canWrite || arena.networkMismatch || writeBusy || Boolean(arena.pendingRecord) || !rewardPreview?.claimable} onClick={() => void submitApproval({ kind: "claimReward", hpAmount: hpAmount ?? 0n }, "Approve BossHP redemption")}>
                        Approve {claimToken?.symbol ?? "BossHP"} for BossHook
                      </ActionButton>
                    ) : (
                      <ActionButton disabled={!arena.canWrite || arena.networkMismatch || writeBusy || Boolean(arena.pendingRecord) || !claimApproval || !rewardPreview?.claimable} onClick={() => void claimReward()}>
                        Surrender HP and claim {rewardToken?.symbol ?? "reward"}
                      </ActionButton>
                    )}
                  </>
                )}
                {claimableAmount === 0n && <p className="mt-2 text-xs text-[#405b88]">{factory ? "No reward credit is available for this account." : `No unredeemed ${claimToken?.symbol ?? "BossHP"} is held by this account.`}</p>}
              </div>
              <div className="border-[#2b4a8b]/25 border-l pl-3">
                <p className="font-system text-[9px] tracking-[0.1em] text-[#405b88]">PARTICIPATION-BASED VICTORY NFT</p>
                <p className="mt-1 text-xs text-[#405b88]">Eligibility follows the account’s attack history, even if its HP was transferred away.</p>
                {player.victoryClaimed ? (
                  <p className="mt-2 text-xs text-[#286b36]">Victory NFT already claimed.</p>
                ) : player.hasAttacked ? (
                  <ActionButton disabled={!arena.canWrite || arena.networkMismatch || writeBusy || Boolean(arena.pendingRecord)} onClick={() => void claimVictoryNFT()}>
                    Claim victory NFT
                  </ActionButton>
                ) : (
                  <p className="mt-2 text-xs text-[#405b88]">This wallet did not attack the round, so it is not NFT eligible.</p>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {lastResult && <ConfirmedResult result={lastResult} hpToken={hpToken} claimToken={claimToken} rewardToken={rewardToken} />}
      {writeMatches && arena.writeState.status !== "idle" && <WriteStatus state={arena.writeState} hpToken={hpToken} rewardToken={rewardToken} />}
      {writeBusy && !writeMatches && <p className="mt-4 text-xs text-[#2b4a8b]" role="status">A wallet action for another boss is still in progress. It stays attached to its original encounter.</p>}
      {arena.pendingRecord && <div className="mt-2">
        <p className="text-xs text-[#405b88]">{writeMatches ? `A transaction from ${arena.pendingRecord.network} is saved for this boss.` : "A transaction for another boss is saved."} Check its receipt before another write.</p>
        <ActionButton disabled={arena.writeState.status === "pending" || arena.writeState.status === "prompting"} onClick={() => void arena.resumePending()}>
          Check saved transaction
        </ActionButton>
      </div>}
      {round && !active && !defeated && round.status === 4 && (
        <p className="border-[#2b4a8b]/25 mt-4 border-t pt-3 text-xs text-[#405b88]">Round expired at its on-chain deadline. Attacks are closed.</p>
      )}
      {round && round.status !== 3 && round.status !== 4 && (round.deadline !== 0n && chainTimestamp >= round.deadline) && (
        <p className="border-[#2b4a8b]/25 mt-4 border-t pt-3 text-xs text-[#a14845]">The on-chain deadline has passed. Attacks are disabled.</p>
      )}
    </div>
  );
});

function ReadinessRow({
  step,
  title,
  state,
  children,
}: {
  step: string;
  title: string;
  state: "ready" | "needed" | "waiting" | "stale" | "closed";
  children: React.ReactNode;
}) {
  const badge = {
    ready: "READY",
    needed: "ACTION NEEDED",
    waiting: "WAITING",
    stale: "REFRESHING",
    closed: "CLOSED",
  }[state];
  return (
    <div className="grid grid-cols-[26px_1fr] gap-2.5 border-t border-[#2b4a8b]/25 pt-3">
      <span className="grid size-6 place-items-center border border-[#2b4a8b]/40 font-system text-[9px] text-[#405b88]">{step}</span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-medium">{title}</h4>
          <span className={`font-system text-[8px] tracking-[0.1em] ${state === "ready" ? "text-[#286b36]" : state === "stale" || state === "closed" ? "text-[#a14845]" : "text-[#405b88]"}`}>{badge}</span>
        </div>
        <div className="mt-1.5">{children}</div>
      </div>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mt-2 min-h-11 border-2 px-3 py-2 font-pixel text-[9px] tracking-[0.1em] transition-opacity disabled:cursor-not-allowed disabled:opacity-35 ${
        primary ? "border-[#2b4a8b] bg-[#2b4a8b] font-medium text-white" : "border-[#2b4a8b] bg-transparent text-[#2b4a8b]"
      }`}
    >
      {children}
    </button>
  );
}

function QuoteMetric({ label, amount, decimals, unit }: { label: string; amount: bigint; decimals: number; unit: string }) {
  const exact = `${displayAmount(amount, decimals)} ${unit}`;
  return (
    <div className="min-w-0" title={exact} aria-label={`${label}: approximately ${displayEstimate(amount, decimals)} ${unit}; exact ${exact}`}>
      <p className="font-system text-[8px] tracking-[0.09em] text-[#405b88]">{label}</p>
      <p className="mt-0.5 break-words text-xs text-[#2b4a8b]">≈ {displayEstimate(amount, decimals)} {unit}</p>
    </div>
  );
}

function ExactValue({ label, amount, decimals, unit }: { label: string; amount: bigint; decimals: number; unit: string }) {
  return <div className="flex flex-wrap gap-x-1"><dt>{label}:</dt><dd className="break-all">{displayAmount(amount, decimals)} {unit}</dd></div>;
}

function ConfirmedResult({ result, hpToken, claimToken, rewardToken }: {
  result: ActionResult;
  hpToken?: { symbol: string; decimals: number };
  claimToken?: { symbol: string; decimals: number };
  rewardToken?: { symbol: string; decimals: number };
}) {
  let text: string;
  switch (result.kind) {
    case "approval":
      text = `${result.attackCap ? `Attack cap up to ${displayAmount(result.attackCap, MOCK_USD_DECIMALS)} MockUSD · ` : ""}Unlimited allowance set · ${shortAddress(result.token)} → ${shortAddress(result.spender)}`;
      break;
    case "attack":
      text = `Confirmed ${displayAmount(result.result.bossHPOut, hpToken?.decimals ?? 18)} ${hpToken?.symbol ?? "HP"} output · ${displayAmount(result.result.mockUSDSpent, MOCK_USD_DECIMALS)} mUSD spent (cap ${displayAmount(result.maxMockUSD, MOCK_USD_DECIMALS)} MockUSD) · ${displayAmount(result.result.royRefunded, 18)} Attack Token returned`;
      break;
    case "reward":
      text = `${claimToken?.symbol ?? "HP"} reward amount ${displayAmount(result.hpAmount, claimToken?.decimals ?? 18)} · received ${displayAmount(result.payout, rewardToken?.decimals ?? 18)} ${rewardToken?.symbol ?? "reward token"}`;
      break;
    case "nft":
      text = `Victory NFT #${result.tokenId} confirmed`;
      break;
  }
  return (
    <div className="border-[#2b4a8b]/25 mt-4 border-t pt-3 text-xs text-[#286b36]" role="status">
      <p>{text}</p>
      <p className="mt-1 break-all font-system text-[9px] text-[#405b88]">Confirmed · {result.hash}</p>
    </div>
  );
}

function WriteStatus({ state, hpToken, rewardToken }: {
  state: Arena["writeState"];
  hpToken?: { symbol: string; decimals: number };
  rewardToken?: { symbol: string; decimals: number };
}) {
  if (state.status === "prompting") {
    return <p className="mt-4 text-xs text-[#405b88]" role="status">Wallet prompt: {state.action}. No game state changes until a receipt confirms.</p>;
  }
  if (state.status === "pending") {
    return <p className="mt-4 text-xs text-[#2b4a8b]" role="status">{state.action} submitted. Waiting for a confirmed receipt; encounter state has not changed yet.</p>;
  }
  if (state.status === "unresolved") {
    return <p className="mt-4 text-xs text-[#a14845]" role="status">{state.action} is unresolved: {state.message}</p>;
  }
  if (state.status === "confirmed") {
    return (
      <div className="mt-4 text-xs text-[#286b36]" role="status">
        <p>Confirmed · {state.record.request.hash}</p>
        <p className="mt-1 text-[#405b88]">{recoveredSummary(state.result, hpToken, rewardToken)}</p>
      </div>
    );
  }
  if (state.status === "idle") return null;
  return <p className={`mt-4 break-words text-xs ${state.status === "rejected" ? "text-[#405b88]" : "text-[#a14845]"}`} role="status">{state.status.toUpperCase()}: {state.message}{state.hash ? ` · ${state.hash}` : ""}</p>;
}

function ApprovalWriteStatus({ state }: { state: Arena["writeState"] }) {
  if (state.status === "idle") return null;
  const message = state.status === "prompting"
    ? "Confirm MockUSD approval in your wallet."
    : state.status === "pending"
      ? "Approval submitted. Waiting for its confirmed receipt."
      : state.status === "unresolved"
        ? `Approval is unresolved: ${state.message}`
        : state.status === "confirmed"
          ? `Approval receipt confirmed · ${state.record.request.hash}. Checking the resulting allowance.`
          : `${state.status.toUpperCase()}: ${state.message}${state.hash ? ` · ${state.hash}` : ""}`;
  return <p className="mt-3 break-all text-xs text-[#2b4a8b]" role="status">{message}</p>;
}

function recoveredSummary(result: unknown, hpToken?: { symbol: string; decimals: number }, rewardToken?: { symbol: string; decimals: number }): string {
  if (!result || typeof result !== "object") return "Receipt validated by the shared chain SDK.";
  if ("bossHPOut" in result && typeof result.bossHPOut === "bigint") {
    return `Received ${displayAmount(result.bossHPOut, hpToken?.decimals ?? 18)} ${hpToken?.symbol ?? "encounter token"}.`;
  }
  if ("payout" in result && typeof result.payout === "bigint") {
    return `Received ${displayAmount(result.payout, rewardToken?.decimals ?? 18)} ${rewardToken?.symbol ?? "reward token"}.`;
  }
  if ("tokenId" in result && typeof result.tokenId === "bigint") return `Confirmed token #${result.tokenId}.`;
  if ("events" in result && Array.isArray(result.events)) {
    const names = result.events.map((event) => (
      event && typeof event === "object" && "eventName" in event && typeof event.eventName === "string" ? event.eventName : null
    )).filter((name): name is string => name !== null);
    return names.length ? `Confirmed events: ${[...new Set(names)].join(" · ")}.` : "Receipt validated by the shared chain SDK.";
  }
  return "Receipt validated by the shared chain SDK.";
}

function parseTokenAmount(value: string, decimals: number): bigint | null {
  const normalized = value.trim();
  if (!/^(?:\d+)(?:\.\d*)?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) return null;
  const scale = 10n ** BigInt(decimals);
  return BigInt(whole) * scale + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function formatUtc(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1_000);
  return Number.isNaN(date.getTime()) ? "unavailable" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}
