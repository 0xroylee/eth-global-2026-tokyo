import {
  decodeEventLog,
  decodeErrorResult,
  decodeFunctionData,
  encodeFunctionData,
  maxUint256,
  WaitForTransactionReceiptTimeoutError,
  type Abi,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type ReplacementReturnType,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import {
  bossCollectiblesAbi,
  bossHpAbi,
  bossPoolHookAbi,
  bossRouterAbi,
  mockUsdAbi,
} from "./generated/abi";
import { isVerifiedDeployment, type VerifiedDeployment } from "./deployment";
import { readPlayer, readRound, readState, type RoundSnapshot } from "./reads";

const CLAIMABLE_STATUS = 3;
const ACTIVE_STATUS = 1;
const DEFAULT_SLIPPAGE_BPS = 100;
const DEFAULT_QUOTE_TTL_SECONDS = 300n;
const DEFAULT_RECEIPT_TIMEOUT_MS = 120_000;
const QUOTE_SIMULATOR = "0x000000000000000000000000000000000000dEaD" as Address;

export type ApprovalAction =
  | { kind: "enroll" }
  | { kind: "attack"; maxMockUSD: bigint }
  | { kind: "claimReward"; hpAmount: bigint };

export type ApprovalStatus = {
  action: ApprovalAction["kind"];
  token: "MockUSD" | "BossHP";
  tokenAddress: Address;
  spender: "BossHook" | "BossRouter";
  spenderAddress: Address;
  account: Address;
  requiredAllowance: bigint;
  currentAllowance: bigint;
  approvalNeeded: boolean;
  approvalAmount: bigint;
};

export type AttackQuote = {
  chainId: number;
  deploymentTxHash: Hex;
  router: Address;
  hook: Address;
  account?: Address;
  quotedBlock: bigint;
  quotedAt: bigint;
  expiresAt: bigint;
  stage: number;
  maxMockUSD: bigint;
  mockUSDSpent: bigint;
  mockUSDRefunded: bigint;
  royBought: bigint;
  roySpent: bigint;
  royRefunded: bigint;
  bossHPOut: bigint;
  minRoyOut: bigint;
  minBossHPOut: bigint;
  slippageBps: number;
  stageCleared: boolean;
  bossDefeated: boolean;
  nextStage: number;
};
export type PreparedAttack = {
  quote: AttackQuote;
  account: Address;
  callDeadline: bigint;
  args: readonly [bigint, bigint, bigint, number, bigint];
  simulated: { mockUSDSpent: bigint; royBought: bigint; roySpent: bigint; bossHPOut: bigint };
};

type DecodedEventBase<Name extends string, Args extends object> = {
  address: Address;
  eventName: Name;
  args: Args;
  transactionHash: Hex;
  logIndex: number;
};
export type DecodedContractEvent =
  | DecodedEventBase<"Approval", { owner: Address; spender: Address; value: bigint }>
  | DecodedEventBase<"Transfer", { from: Address; to: Address; value: bigint }>
  | DecodedEventBase<"Enrolled", { player: Address; entryFee: bigint; starterRoy: bigint; tokenId: bigint }>
  | DecodedEventBase<"AttackExecuted", { player: Address; stage: number; mockUSDSpent: bigint; royBought: bigint; roySpent: bigint; bossHPReceived: bigint; mockUSDRefunded: bigint; royRefunded: bigint }>
  | DecodedEventBase<"AttackRecorded", { player: Address; stage: number; bossHPOut: bigint; cumulativeSold: bigint }>
  | DecodedEventBase<"StageCleared", { stage: number; sold: bigint; capacity: bigint; roundingDust: bigint }>
  | DecodedEventBase<"StageRefilled", { clearedStage: number; bossHPIn: bigint; royRecovered: bigint; nextStage: number }>
  | DecodedEventBase<"StageActivated", { stage: number; sqrtPriceX96: bigint; liquidity: bigint; capacity: bigint }>
  | DecodedEventBase<"BossDefeated", { finalEligibleHP: bigint; originalPrize: bigint }>
  | DecodedEventBase<"RewardClaimed", { player: Address; bossHPIn: bigint; mockUSDOut: bigint }>
  | DecodedEventBase<"VictoryNFTClaimed", { player: Address; tokenId: bigint }>;

export type PendingActionKind = "approval" | "enroll" | "attack" | "transferBossHP" | "claimReward" | "claimVictoryNFT" | "faucetMockUSD";
export type PendingRequest = {
  hash: Hex;
  kind: PendingActionKind;
  chainId: number;
  account: Address;
  target: Address;
  calldata: Hex;
};

export type ConfirmedTransaction<T> = {
  status: "confirmed";
  hash: Hex;
  receipt: TransactionReceipt;
  replaced: boolean;
  result: T;
};
export type UnresolvedTransaction = { status: "unresolved"; hash: Hex };
export type WaitResult<T> = ConfirmedTransaction<T> | UnresolvedTransaction;
export type PendingOperation<T> = {
  hash: Hex;
  action: string;
  request: PendingRequest;
  wait(): Promise<WaitResult<T>>;
};

export type ApprovalResult = {
  action: ApprovalAction["kind"];
  account: Address;
  token: Address;
  spender: Address;
  amount: bigint;
  events: readonly DecodedContractEvent[];
};
export type SkippedApproval = { status: "skipped"; approval: ApprovalStatus };
export type EnrollmentResult = {
  account: Address;
  entryFee: bigint;
  starterRoy: bigint;
  entryTokenId: bigint;
  events: readonly DecodedContractEvent[];
};
export type AttackResult = {
  account: Address;
  stage: number;
  mockUSDSpent: bigint;
  mockUSDRefunded: bigint;
  royBought: bigint;
  roySpent: bigint;
  royRefunded: bigint;
  bossHPOut: bigint;
  events: readonly DecodedContractEvent[];
};
export type RewardPreview = {
  account?: Address;
  hpAmount: bigint;
  originalPrize: bigint;
  finalEligibleHP: bigint;
  redeemedHP: bigint;
  payout: bigint;
  claimable: boolean;
  blockNumber: bigint;
};
export type RewardClaimResult = {
  account: Address;
  hpAmount: bigint;
  payout: bigint;
  events: readonly DecodedContractEvent[];
};
export type VictoryClaimResult = {
  account: Address;
  tokenId: bigint;
  events: readonly DecodedContractEvent[];
};
export type FaucetResult = {
  account: Address;
  amount: bigint;
  events: readonly DecodedContractEvent[];
};
export type BossHPTransferResult = {
  account: Address;
  recipient: Address;
  amount: bigint;
  events: readonly DecodedContractEvent[];
};

export type BossPoolSdkOptions = {
  publicClient: PublicClient;
  deployment: VerifiedDeployment;
  walletClient?: WalletClient<Transport, Chain | undefined, Account | undefined>;
  receiptTimeoutMs?: number;
};

export class BossPoolSdkError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "BossPoolSdkError";
    this.code = code;
  }
}

export class RequoteRequiredError extends BossPoolSdkError {
  readonly reason: "expired" | "stage-changed" | "round-not-active" | "account-changed" | "deployment-changed" | "slippage";
  constructor(reason: RequoteRequiredError["reason"], message: string) {
    super("REQUOTE_REQUIRED", message);
    this.name = "RequoteRequiredError";
    this.reason = reason;
  }
}

export class TransactionReplacedError extends BossPoolSdkError {
  readonly originalHash: Hex;
  readonly replacementHash: Hex;
  readonly reason: "cancelled" | "replaced" | "repriced";
  constructor(originalHash: Hex, replacementHash: Hex, reason: "cancelled" | "replaced" | "repriced") {
    super("TRANSACTION_REPLACED", `Transaction ${originalHash} was ${reason} by ${replacementHash}; it did not confirm the requested action.`);
    this.name = "TransactionReplacedError";
    this.originalHash = originalHash;
    this.replacementHash = replacementHash;
    this.reason = reason;
  }
}

export class TransactionRevertedError extends BossPoolSdkError {
  readonly hash: Hex;
  readonly receipt: TransactionReceipt;
  constructor(hash: Hex, receipt: TransactionReceipt) {
    super("TRANSACTION_REVERTED", `Transaction ${hash} was mined and reverted.`);
    this.name = "TransactionRevertedError";
    this.hash = hash;
    this.receipt = receipt;
  }
}

type EventSpec = { address: Address; abi: Abi; eventName: string; required?: boolean };
export type RecoveryResult = { action: PendingActionKind; account: Address; events: readonly DecodedContractEvent[] };

export type BossPoolSdk = ReturnType<typeof createBossPoolSdk>;

export function createBossPoolSdk(options: BossPoolSdkOptions) {
  const { publicClient, deployment } = options;
  const timeout = options.receiptTimeoutMs ?? DEFAULT_RECEIPT_TIMEOUT_MS;
  if (!isVerifiedDeployment(deployment, publicClient)) {
    throw new Error("Call verifyDeployment with this public client before creating the Boss Pool SDK.");
  }
  if (publicClient.chain && publicClient.chain.id !== deployment.chainId) {
    throw new Error(`Public client is configured for chain ${publicClient.chain.id}; deployment is on ${deployment.chainId}.`);
  }
  const { manifest } = deployment;
  const { hook, router, bossHP, roy, mockUSD, collectibles } = manifest.addresses;

  async function assertClientChain(): Promise<void> {
    const chainId = await publicClient.getChainId();
    if (chainId !== deployment.chainId) throw new Error(`RPC chain changed to ${chainId}; expected ${deployment.chainId}.`);
  }

  async function requireWalletAccount(requested?: Address): Promise<{
    wallet: WalletClient<Transport, Chain | undefined, Account | undefined>;
    account: Address;
    writeAccount: Account | Address;
  }> {
    const wallet = options.walletClient;
    if (!wallet) throw new BossPoolSdkError("WALLET_REQUIRED", "Connect a wallet before this action.");
    const [walletChain, accounts] = await Promise.all([wallet.getChainId(), wallet.getAddresses()]);
    if (walletChain !== deployment.chainId) {
      throw new BossPoolSdkError("WRONG_WALLET_CHAIN", `Wallet chain is ${walletChain}; expected ${deployment.chainId}.`);
    }
    const configuredAccount = wallet.account;
    const configuredAddress = configuredAccount && typeof configuredAccount === "object"
      ? configuredAccount.address
      : typeof configuredAccount === "string" ? configuredAccount : undefined;
    let account: Address;
    if (configuredAddress) {
      const configuredIsLocalSigner = typeof configuredAccount === "object" && configuredAccount.type === "local";
      if (configuredIsLocalSigner) {
        if (requested && !sameAddress(configuredAddress, requested)) {
          throw new BossPoolSdkError("WALLET_ACCOUNT_CHANGED", "The configured local signer does not match the requested player account.");
        }
      } else {
        const selectedAddress = accounts[0];
        if (!selectedAddress || !sameAddress(selectedAddress, configuredAddress) ||
            (requested && !sameAddress(selectedAddress, requested))) {
          throw new BossPoolSdkError("WALLET_ACCOUNT_CHANGED", "Configured JSON-RPC account is no longer the wallet's first selected account.");
        }
      }
      account = configuredAddress;
    } else {
      const selectedAccount = accounts[0];
      if (!selectedAccount || (requested && !sameAddress(selectedAccount, requested))) {
        throw new BossPoolSdkError("WALLET_ACCOUNT_CHANGED", "The requested player account is no longer the selected wallet account.");
      }
      account = requested ?? selectedAccount;
    }
    let writeAccount: Account | Address = account;
    if (configuredAccount && typeof configuredAccount === "object") {
      if (!sameAddress(configuredAccount.address, account)) {
        throw new BossPoolSdkError("WALLET_ACCOUNT_CHANGED", "Configured local signer does not match the selected wallet account.");
      }
      writeAccount = configuredAccount;
    } else if (typeof configuredAccount === "string") {
      if (!sameAddress(configuredAccount, account)) {
        throw new BossPoolSdkError("WALLET_ACCOUNT_CHANGED", "Configured wallet account does not match the selected account.");
      }
      writeAccount = configuredAccount;
    }
    await assertClientChain();
    return { wallet, account, writeAccount };
  }

  async function getApproval(action: ApprovalAction, account: Address): Promise<ApprovalStatus> {
    const amount = approvalAmount(action);
    const result = await readApproval(action, account);
    return { ...result, requiredAllowance: amount, approvalNeeded: result.currentAllowance < amount, approvalAmount: maxUint256 };
  }

  async function approve(action: ApprovalAction): Promise<PendingOperation<ApprovalResult> | SkippedApproval> {
    const { account } = await requireWalletAccount();
    const approval = await getApproval(action, account);
    if (!approval.approvalNeeded) return { status: "skipped", approval };
    await publicClient.simulateContract({
      address: approval.tokenAddress,
      abi: approval.token === "MockUSD" ? mockUsdAbi : bossHpAbi,
      functionName: "approve",
      args: [approval.spenderAddress, maxUint256],
      account,
    });
    const checkedWallet = await requireWalletAccount(account);
    const abi = approval.token === "MockUSD" ? mockUsdAbi : bossHpAbi;
    const calldata = encodeFunctionData({
      abi,
      functionName: "approve",
      args: [approval.spenderAddress, maxUint256],
    });
    const hash = await checkedWallet.wallet.writeContract({
      address: approval.tokenAddress,
      abi,
      functionName: "approve",
      args: [approval.spenderAddress, maxUint256],
      account: checkedWallet.writeAccount,
      chain: deployment.chain,
    });
    return makePending<ApprovalResult>({
      hash,
      kind: "approval",
      action: `approve ${approval.token} for ${approval.spender}`,
      account,
      target: approval.tokenAddress,
      calldata,
      expectedEvents: [{ address: approval.tokenAddress, abi, eventName: "Approval" }],
      buildResult: (events) => {
        const event = onlyEvent(events, "Approval");
        assertEventAddress(event.args.owner, account, "Approval event owner does not match the selected wallet.");
        assertEventAddress(event.args.spender, approval.spenderAddress, "Approval event spender does not match the fixed action map.");
        if (event.args.value !== maxUint256) throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "Approval event is not the requested unlimited allowance.");
        return {
          action: action.kind,
          account,
          token: approval.tokenAddress,
          spender: approval.spenderAddress,
          amount: maxUint256,
          events,
        };
      },
    });
  }

  async function enroll(): Promise<PendingOperation<EnrollmentResult>> {
    const { account } = await requireWalletAccount();
    const state = await readState(publicClient, deployment, account);
    assertActiveBeforeDeadline(state.round);
    if (state.player?.enrolled) throw new BossPoolSdkError("ALREADY_ENROLLED", "This account is already enrolled.");
    await publicClient.simulateContract({
      address: hook,
      abi: bossPoolHookAbi,
      functionName: "enroll",
      account,
    });
    const checkedWallet = await requireWalletAccount(account);
    const calldata = encodeFunctionData({ abi: bossPoolHookAbi, functionName: "enroll" });
    const hash = await checkedWallet.wallet.writeContract({
      address: hook, abi: bossPoolHookAbi, functionName: "enroll", account: checkedWallet.writeAccount, chain: deployment.chain,
    });
    return makePending({
      hash,
      kind: "enroll",
      action: "enroll",
      account,
      target: hook,
      calldata,
      expectedEvents: [{ address: hook, abi: bossPoolHookAbi, eventName: "Enrolled" }],
      buildResult: (events) => {
        const event = onlyEvent(events, "Enrolled");
        assertEventAddress(event.args.player, account, "Enrollment event player does not match the selected wallet.");
        return {
          account,
          entryFee: asBigInt(event.args.entryFee),
          starterRoy: asBigInt(event.args.starterRoy),
          entryTokenId: asBigInt(event.args.tokenId),
          events,
        };
      },
    });
  }

  async function quoteAttack(input: {
    maxMockUSD: bigint;
    stage?: number;
    account?: Address;
    slippageBps?: number;
    validitySeconds?: bigint;
  }): Promise<AttackQuote> {
    if (input.maxMockUSD <= 0n) throw new BossPoolSdkError("INVALID_ATTACK_CAP", "Attack input cap must be positive.");
    const slippageBps = input.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
    if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
      throw new BossPoolSdkError("INVALID_SLIPPAGE", "Slippage tolerance must be from 0 through 9999 basis points.");
    }
    const snapshot = await readState(publicClient, deployment);
    const round = snapshot.round;
    assertActiveBeforeDeadline(round);
    const stage = input.stage ?? round.currentStage;
    if (stage !== round.currentStage) throw new RequoteRequiredError("stage-changed", "The requested stage is no longer active; get a fresh quote.");
    const result = await publicClient.simulateContract({
      address: router,
      abi: bossRouterAbi,
      functionName: "quoteAttackWithMockUSD",
      args: [input.maxMockUSD, stage],
      account: QUOTE_SIMULATOR,
      blockNumber: round.blockNumber,
    });
    const quote = normalizeQuoteResult(result.result);
    if (quote.mockUSDSpent <= 0n || quote.royBought <= 0n || quote.roySpent <= 0n || quote.bossHPOut <= 0n) {
      throw new BossPoolSdkError("EMPTY_ATTACK_QUOTE", "The current route produced no usable attack output.");
    }
    const ttl = input.validitySeconds ?? DEFAULT_QUOTE_TTL_SECONDS;
    if (ttl <= 0n) throw new BossPoolSdkError("INVALID_QUOTE_TTL", "Quote validity must be positive.");
    const requestedExpiry = round.blockTimestamp + ttl;
    const expiresAt = requestedExpiry < round.deadline ? requestedExpiry : round.deadline - 1n;
    if (expiresAt <= round.blockTimestamp) throw new RequoteRequiredError("expired", "The round deadline is too close to quote an attack.");
    return {
      chainId: deployment.chainId,
      deploymentTxHash: manifest.deploymentTxHash,
      router,
      hook,
      account: input.account,
      quotedBlock: round.blockNumber,
      quotedAt: round.blockTimestamp,
      expiresAt,
      stage,
      maxMockUSD: input.maxMockUSD,
      mockUSDSpent: quote.mockUSDSpent,
      mockUSDRefunded: input.maxMockUSD - quote.mockUSDSpent,
      royBought: quote.royBought,
      roySpent: quote.roySpent,
      royRefunded: quote.royBought - quote.roySpent,
      bossHPOut: quote.bossHPOut,
      minRoyOut: minimumOutput(quote.royBought, slippageBps),
      minBossHPOut: minimumOutput(quote.bossHPOut, slippageBps),
      slippageBps,
      stageCleared: quote.stageCleared,
      bossDefeated: quote.bossDefeated,
      nextStage: quote.nextStage,
    };
  }

  async function prepareAttack(quote: AttackQuote): Promise<PreparedAttack> {
    const { account } = await requireWalletAccount();
    if (quote.account && !sameAddress(quote.account, account)) {
      throw new RequoteRequiredError("account-changed", "This quote was prepared for a different wallet account.");
    }
    if (
      quote.chainId !== deployment.chainId || quote.deploymentTxHash.toLowerCase() !== manifest.deploymentTxHash.toLowerCase() ||
      !sameAddress(quote.router, router) || !sameAddress(quote.hook, hook)
    ) throw new RequoteRequiredError("deployment-changed", "Quote belongs to a different chain or deployment.");
    const round = await readRound(publicClient, deployment);
    if (round.blockTimestamp >= quote.expiresAt || round.blockTimestamp >= round.deadline) {
      throw new RequoteRequiredError("expired", "Attack quote or round deadline has expired.");
    }
    if (round.status !== ACTIVE_STATUS) throw new RequoteRequiredError("round-not-active", "The round is no longer Active.");
    if (round.currentStage !== quote.stage) throw new RequoteRequiredError("stage-changed", "The active stage changed; get a fresh quote.");
    const callDeadline = quote.expiresAt < round.deadline ? quote.expiresAt : round.deadline - 1n;
    const args = [quote.maxMockUSD, quote.minRoyOut, quote.minBossHPOut, quote.stage, callDeadline] as const;
    let simulationResult: readonly [bigint, bigint, bigint, bigint];
    try {
      const simulation = await publicClient.simulateContract({
        address: router,
        abi: bossRouterAbi,
        functionName: "attackWithMockUSD",
        args,
        account,
      });
      simulationResult = simulation.result;
    } catch (error) {
      const contractError = findContractErrorName(error);
      if (contractError === "SlippageExceeded") {
        throw new RequoteRequiredError("slippage", "Current execution no longer meets the output floors you accepted. Get a fresh quote.");
      }
      if (contractError === "InvalidAttack") {
        const fresh = await readRound(publicClient, deployment);
        if (fresh.currentStage !== quote.stage) {
          throw new RequoteRequiredError("stage-changed", "The active stage changed during final simulation; get a fresh quote.");
        }
        if (fresh.status !== ACTIVE_STATUS) {
          throw new RequoteRequiredError("round-not-active", "The round changed state during final simulation.");
        }
        if (fresh.blockTimestamp >= fresh.deadline || fresh.blockTimestamp >= quote.expiresAt) {
          throw new RequoteRequiredError("expired", "The round or quote expired during final simulation.");
        }
      }
      throw error;
    }
    const [simulatedMockUSDSpent, simulatedRoyBought, simulatedRoySpent, simulatedHP] = simulationResult;
    if (simulatedRoyBought < quote.minRoyOut || simulatedHP < quote.minBossHPOut) {
      throw new RequoteRequiredError("slippage", "Current execution no longer meets the output floors you accepted. Get a fresh quote.");
    }
    return {
      quote,
      account,
      callDeadline,
      args,
      simulated: {
        mockUSDSpent: simulatedMockUSDSpent,
        royBought: simulatedRoyBought,
        roySpent: simulatedRoySpent,
        bossHPOut: simulatedHP,
      },
    };
  }

  async function attack(quote: AttackQuote): Promise<PendingOperation<AttackResult>> {
    const prepared = await prepareAttack(quote);
    const { account, args } = prepared;
    const checkedWallet = await requireWalletAccount(account);
    const calldata = encodeFunctionData({ abi: bossRouterAbi, functionName: "attackWithMockUSD", args });
    const hash = await checkedWallet.wallet.writeContract({
      address: router, abi: bossRouterAbi, functionName: "attackWithMockUSD", args,
      account: checkedWallet.writeAccount, chain: deployment.chain,
    });
    return makePending({
      hash,
      kind: "attack",
      action: "attack",
      account,
      target: router,
      calldata,
      expectedEvents: [
        { address: router, abi: bossRouterAbi, eventName: "AttackExecuted" },
        { address: hook, abi: bossPoolHookAbi, eventName: "AttackRecorded" },
        { address: hook, abi: bossPoolHookAbi, eventName: "StageCleared", required: false },
        { address: router, abi: bossRouterAbi, eventName: "StageRefilled", required: false },
        { address: hook, abi: bossPoolHookAbi, eventName: "StageActivated", required: false },
        { address: hook, abi: bossPoolHookAbi, eventName: "BossDefeated", required: false },
      ],
      buildResult: (events) => {
        const event = onlyEvent(events, "AttackExecuted");
        assertEventAddress(event.args.player, account, "Attack event player does not match the selected wallet.");
        if (asBigInt(event.args.stage) !== BigInt(quote.stage)) {
          throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "Attack event stage does not match the accepted quote.");
        }
        return {
          account,
          stage: quote.stage,
          mockUSDSpent: asBigInt(event.args.mockUSDSpent),
          mockUSDRefunded: asBigInt(event.args.mockUSDRefunded),
          royBought: asBigInt(event.args.royBought),
          roySpent: asBigInt(event.args.roySpent),
          royRefunded: asBigInt(event.args.royRefunded),
          bossHPOut: asBigInt(event.args.bossHPReceived),
          events,
        };
      },
    });
  }

  async function previewReward(hpAmount: bigint, account?: Address): Promise<RewardPreview> {
    if (hpAmount <= 0n) throw new BossPoolSdkError("INVALID_REWARD_AMOUNT", "BossHP amount must be positive.");
    const state = await readState(publicClient, deployment, account);
    const round = state.round;
    if (round.status !== CLAIMABLE_STATUS || round.finalEligibleHP === 0n) {
      throw new BossPoolSdkError("REWARD_NOT_AVAILABLE", "Reward preview is available only after the round is Defeated.");
    }
    if (round.redeemedHP + hpAmount > round.finalEligibleHP) {
      throw new BossPoolSdkError("REWARD_AMOUNT_EXCEEDS_REMAINING", "Requested BossHP exceeds the remaining eligible supply.");
    }
    if (state.player && hpAmount > state.player.bossHPBalance) {
      throw new BossPoolSdkError("INSUFFICIENT_PLAYER_BOSShp", "Account does not hold the requested BossHP amount.");
    }
    const payout = round.originalPrize * hpAmount / round.finalEligibleHP;
    return {
      account,
      hpAmount,
      originalPrize: round.originalPrize,
      finalEligibleHP: round.finalEligibleHP,
      redeemedHP: round.redeemedHP,
      payout,
      claimable: payout > 0n,
      blockNumber: round.blockNumber,
    };
  }

  async function claimReward(hpAmount: bigint): Promise<PendingOperation<RewardClaimResult>> {
    const { account } = await requireWalletAccount();
    await previewReward(hpAmount, account);
    await publicClient.simulateContract({
      address: hook,
      abi: bossPoolHookAbi,
      functionName: "claimReward",
      args: [hpAmount],
      account,
    });
    const checkedWallet = await requireWalletAccount(account);
    const args = [hpAmount] as const;
    const calldata = encodeFunctionData({ abi: bossPoolHookAbi, functionName: "claimReward", args });
    const hash = await checkedWallet.wallet.writeContract({
      address: hook, abi: bossPoolHookAbi, functionName: "claimReward", args,
      account: checkedWallet.writeAccount, chain: deployment.chain,
    });
    return makePending({
      hash,
      kind: "claimReward",
      action: "claim reward",
      account,
      target: hook,
      calldata,
      expectedEvents: [{ address: hook, abi: bossPoolHookAbi, eventName: "RewardClaimed" }],
      buildResult: (events) => {
        const event = onlyEvent(events, "RewardClaimed");
        assertEventAddress(event.args.player, account, "Reward event player does not match the selected wallet.");
        if (asBigInt(event.args.bossHPIn) !== hpAmount) {
          throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "Reward event surrendered a different BossHP amount.");
        }
        return { account, hpAmount, payout: asBigInt(event.args.mockUSDOut), events };
      },
    });
  }

  async function transferBossHP(recipient: Address, amount: bigint): Promise<PendingOperation<BossHPTransferResult>> {
    const { account } = await requireWalletAccount();
    if (amount <= 0n || sameAddress(recipient, ZERO_ADDRESS)) {
      throw new BossPoolSdkError("INVALID_BOSSHp_TRANSFER", "BossHP transfer requires a positive amount and nonzero recipient.");
    }
    await publicClient.simulateContract({
      address: bossHP,
      abi: bossHpAbi,
      functionName: "transfer",
      args: [recipient, amount],
      account,
    });
    const checkedWallet = await requireWalletAccount(account);
    const args = [recipient, amount] as const;
    const calldata = encodeFunctionData({ abi: bossHpAbi, functionName: "transfer", args });
    const hash = await checkedWallet.wallet.writeContract({
      address: bossHP, abi: bossHpAbi, functionName: "transfer", args,
      account: checkedWallet.writeAccount, chain: deployment.chain,
    });
    return makePending({
      hash,
      kind: "transferBossHP",
      action: "transfer BossHP",
      account,
      target: bossHP,
      calldata,
      expectedEvents: [{ address: bossHP, abi: bossHpAbi, eventName: "Transfer" }],
      buildResult: (events) => {
        const event = onlyEvent(events, "Transfer");
        assertEventAddress(event.args.from, account, "BossHP transfer sender does not match the selected wallet.");
        assertEventAddress(event.args.to, recipient, "BossHP transfer recipient differs from the request.");
        if (event.args.value !== amount) throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "BossHP transfer amount differs from the request.");
        return { account, recipient, amount, events };
      },
    });
  }

  async function claimVictoryNFT(): Promise<PendingOperation<VictoryClaimResult>> {
    const { account } = await requireWalletAccount();
    const player = await readPlayer(publicClient, deployment, account);
    if (!player.hasAttacked) throw new BossPoolSdkError("VICTORY_NFT_NOT_ELIGIBLE", "This account has not attacked this round.");
    if (player.victoryClaimed) throw new BossPoolSdkError("VICTORY_NFT_ALREADY_CLAIMED", "This account already claimed its victory NFT.");
    const round = await readRound(publicClient, deployment);
    if (round.status !== CLAIMABLE_STATUS) throw new BossPoolSdkError("VICTORY_NFT_NOT_AVAILABLE", "Victory NFTs are available only after the round is Defeated.");
    await publicClient.simulateContract({ address: hook, abi: bossPoolHookAbi, functionName: "claimVictoryNFT", account });
    const checkedWallet = await requireWalletAccount(account);
    const calldata = encodeFunctionData({ abi: bossPoolHookAbi, functionName: "claimVictoryNFT" });
    const hash = await checkedWallet.wallet.writeContract({
      address: hook, abi: bossPoolHookAbi, functionName: "claimVictoryNFT", account: checkedWallet.writeAccount, chain: deployment.chain,
    });
    return makePending({
      hash,
      kind: "claimVictoryNFT",
      action: "claim victory NFT",
      account,
      target: hook,
      calldata,
      expectedEvents: [{ address: hook, abi: bossPoolHookAbi, eventName: "VictoryNFTClaimed" }],
      buildResult: (events) => {
        const event = onlyEvent(events, "VictoryNFTClaimed");
        assertEventAddress(event.args.player, account, "Victory NFT event player does not match the selected wallet.");
        return { account, tokenId: asBigInt(event.args.tokenId), events };
      },
    });
  }

  async function faucetMockUSD(amount: bigint): Promise<PendingOperation<FaucetResult>> {
    const { account } = await requireWalletAccount();
    if (amount <= 0n) throw new BossPoolSdkError("INVALID_FAUCET_AMOUNT", "MockUSD faucet amount must be positive.");
    await publicClient.simulateContract({
      address: mockUSD,
      abi: mockUsdAbi,
      functionName: "faucet",
      args: [account, amount],
      account,
    });
    const checkedWallet = await requireWalletAccount(account);
    const args = [account, amount] as const;
    const calldata = encodeFunctionData({ abi: mockUsdAbi, functionName: "faucet", args });
    const hash = await checkedWallet.wallet.writeContract({
      address: mockUSD, abi: mockUsdAbi, functionName: "faucet", args,
      account: checkedWallet.writeAccount, chain: deployment.chain,
    });
    return makePending({
      hash,
      kind: "faucetMockUSD",
      action: "faucet MockUSD",
      account,
      target: mockUSD,
      calldata,
      expectedEvents: [{ address: mockUSD, abi: mockUsdAbi, eventName: "Transfer" }],
      buildResult: (events) => {
        const transfer = onlyEvent(events, "Transfer");
        assertEventAddress(transfer.args.from, ZERO_ADDRESS, "Faucet transfer did not mint MockUSD.");
        assertEventAddress(transfer.args.to, account, "Faucet transfer destination does not match the selected wallet.");
        if (asBigInt(transfer.args.value) !== amount) {
          throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "Faucet transfer amount differs from the request.");
        }
        return { account, amount, events };
      },
    });
  }

  function resumePending(request: PendingRequest): PendingOperation<RecoveryResult> {
    if (request.chainId !== deployment.chainId) {
      throw new BossPoolSdkError("RECOVERY_CHAIN_MISMATCH", "Pending transaction belongs to another chain.");
    }
    let abi: Abi;
    let eventSpecs: EventSpec[];
    let expectedApproval: { spender: Address; value: bigint } | undefined;
    let expectedFaucetAmount: bigint | undefined;
    let expectedTransfer: { to: Address; value: bigint } | undefined;
    let expectedAttackStage: number | undefined;
    let expectedClaimAmount: bigint | undefined;
    switch (request.kind) {
      case "approval": {
        if (sameAddress(request.target, mockUSD)) abi = mockUsdAbi;
        else if (sameAddress(request.target, bossHP)) abi = bossHpAbi;
        else throw new BossPoolSdkError("RECOVERY_TARGET_MISMATCH", "Approval target is not a configured token.");
        const call = decodeFunctionData({ abi, data: request.calldata });
        if (call.functionName !== "approve") throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending approval calldata is not ERC-20 approve.");
        const args = call.args;
        if (!args || typeof args[0] !== "string" || !/^0x[\da-fA-F]{40}$/.test(args[0]) || typeof args[1] !== "bigint") {
          throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending approval calldata arguments are invalid.");
        }
        const [spenderValue, value] = args;
        const spender = spenderValue as Address;
        const allowedSpender = sameAddress(request.target, bossHP)
          ? sameAddress(spender, hook)
          : sameAddress(spender, hook) || sameAddress(spender, router);
        if (!allowedSpender || value !== maxUint256) {
          throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending approval does not match the fixed spender map and unlimited allowance.");
        }
        expectedApproval = { spender, value };
        eventSpecs = [{ address: request.target, abi, eventName: "Approval" }];
        break;
      }
      case "enroll": {
        if (!sameAddress(request.target, hook)) throw new BossPoolSdkError("RECOVERY_TARGET_MISMATCH", "Enrollment target is not the verified Hook.");
        abi = bossPoolHookAbi;
        if (decodeFunctionData({ abi, data: request.calldata }).functionName !== "enroll") {
          throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending enrollment calldata is invalid.");
        }
        eventSpecs = [{ address: hook, abi, eventName: "Enrolled" }];
        break;
      }
      case "attack": {
        if (!sameAddress(request.target, router)) throw new BossPoolSdkError("RECOVERY_TARGET_MISMATCH", "Attack target is not the verified Router.");
        abi = bossRouterAbi;
        const call = decodeFunctionData({ abi, data: request.calldata });
        if (call.functionName !== "attackWithMockUSD" || !call.args || typeof call.args[3] !== "number") {
          throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending attack calldata is invalid.");
        }
        expectedAttackStage = call.args[3];
        eventSpecs = [
          { address: router, abi: bossRouterAbi, eventName: "AttackExecuted" },
          { address: hook, abi: bossPoolHookAbi, eventName: "AttackRecorded" },
          { address: hook, abi: bossPoolHookAbi, eventName: "StageCleared", required: false },
          { address: router, abi: bossRouterAbi, eventName: "StageRefilled", required: false },
          { address: hook, abi: bossPoolHookAbi, eventName: "StageActivated", required: false },
          { address: hook, abi: bossPoolHookAbi, eventName: "BossDefeated", required: false },
        ];
        break;
      }
      case "transferBossHP": {
        if (!sameAddress(request.target, bossHP)) throw new BossPoolSdkError("RECOVERY_TARGET_MISMATCH", "Transfer target is not the verified BossHP token.");
        abi = bossHpAbi;
        const call = decodeFunctionData({ abi, data: request.calldata });
        if (call.functionName !== "transfer" || !call.args || typeof call.args[0] !== "string" ||
            !/^0x[\da-fA-F]{40}$/.test(call.args[0]) || typeof call.args[1] !== "bigint") {
          throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending BossHP transfer calldata is invalid.");
        }
        expectedTransfer = { to: call.args[0] as Address, value: call.args[1] };
        eventSpecs = [{ address: bossHP, abi: bossHpAbi, eventName: "Transfer" }];
        break;
      }
      case "claimReward": {
        if (!sameAddress(request.target, hook)) throw new BossPoolSdkError("RECOVERY_TARGET_MISMATCH", "Reward target is not the verified Hook.");
        abi = bossPoolHookAbi;
        const call = decodeFunctionData({ abi, data: request.calldata });
        if (call.functionName !== "claimReward" || !call.args || typeof call.args[0] !== "bigint") {
          throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending reward calldata is invalid.");
        }
        expectedClaimAmount = call.args[0];
        eventSpecs = [{ address: hook, abi, eventName: "RewardClaimed" }];
        break;
      }
      case "claimVictoryNFT": {
        if (!sameAddress(request.target, hook)) throw new BossPoolSdkError("RECOVERY_TARGET_MISMATCH", "NFT target is not the verified Hook.");
        abi = bossPoolHookAbi;
        if (decodeFunctionData({ abi, data: request.calldata }).functionName !== "claimVictoryNFT") {
          throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending NFT calldata is invalid.");
        }
        eventSpecs = [{ address: hook, abi, eventName: "VictoryNFTClaimed" }];
        break;
      }
      case "faucetMockUSD": {
        if (!sameAddress(request.target, mockUSD)) throw new BossPoolSdkError("RECOVERY_TARGET_MISMATCH", "Faucet target is not the verified MockUSD.");
        abi = mockUsdAbi;
        const call = decodeFunctionData({ abi, data: request.calldata });
        if (
          call.functionName !== "faucet" || !call.args || typeof call.args[0] !== "string" ||
          !/^0x[\da-fA-F]{40}$/.test(call.args[0]) || !sameAddress(call.args[0] as Address, request.account)
        ) {
          throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending faucet calldata is not for the original account.");
        }
        if (typeof call.args[1] !== "bigint" || call.args[1] <= 0n) {
          throw new BossPoolSdkError("RECOVERY_CALL_MISMATCH", "Pending faucet amount is invalid.");
        }
        expectedFaucetAmount = call.args[1];
        eventSpecs = [{ address: mockUSD, abi, eventName: "Transfer" }];
        break;
      }
    }
    return makePending({
      hash: request.hash,
      kind: request.kind,
      action: `resume ${request.kind}`,
      account: request.account,
      target: request.target,
      calldata: request.calldata,
      expectedEvents: eventSpecs,
      buildResult: (events) => {
        for (const event of events) {
          if (event.eventName === "Enrolled" || event.eventName === "AttackExecuted" || event.eventName === "AttackRecorded" ||
              event.eventName === "RewardClaimed" || event.eventName === "VictoryNFTClaimed") {
            assertEventAddress(event.args.player, request.account, `Recovered ${request.kind} event belongs to a different account.`);
          } else if (event.eventName === "Approval") {
            assertEventAddress(event.args.owner, request.account, "Recovered approval belongs to a different account.");
            if (
              !expectedApproval || !sameAddress(event.args.spender, expectedApproval.spender) ||
              event.args.value !== expectedApproval.value
            ) throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "Recovered approval event does not match the fixed action map.");
          } else if (event.eventName === "Transfer") {
            if (request.kind === "transferBossHP") {
              assertEventAddress(event.args.from, request.account, "Recovered BossHP transfer sender is not the original account.");
              assertEventAddress(event.args.to, expectedTransfer?.to ?? ZERO_ADDRESS, "Recovered BossHP transfer recipient does not match calldata.");
              if (event.args.value !== expectedTransfer?.value) throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "Recovered BossHP transfer amount does not match calldata.");
            } else {
              assertEventAddress(event.args.from, ZERO_ADDRESS, "Recovered faucet event was not a mint.");
              assertEventAddress(event.args.to, request.account, "Recovered faucet transfer belongs to a different account.");
              if (expectedFaucetAmount !== undefined && event.args.value !== expectedFaucetAmount) {
                throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "Recovered faucet amount does not match its calldata.");
              }
            }
          }
          if (event.eventName === "AttackExecuted" && expectedAttackStage !== event.args.stage) {
            throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "Recovered attack stage does not match its calldata.");
          }
          if (event.eventName === "RewardClaimed" && expectedClaimAmount !== event.args.bossHPIn) {
            throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", "Recovered claim amount does not match its calldata.");
          }
        }
        return { action: request.kind, account: request.account, events };
      },
    });
  }

  return {
    deployment,
    publicClient,
    readRound: () => readRound(publicClient, deployment),
    readPlayer: (account: Address) => readPlayer(publicClient, deployment, account),
    readState: (account?: Address) => readState(publicClient, deployment, account),
    quoteAttack,
    prepareAttack,
    getApproval,
    approve,
    enroll,
    attack,
    previewReward,
    claimReward,
    transferBossHP,
    claimVictoryNFT,
    faucetMockUSD,
    resumePending,
    withWallet: (walletClient: WalletClient<Transport, Chain | undefined, Account | undefined>) => createBossPoolSdk({ ...options, walletClient }),
  };

  function approvalAmount(action: ApprovalAction): bigint {
    switch (action.kind) {
      case "enroll": return 10n * 10n ** 6n;
      case "attack": return action.maxMockUSD;
      case "claimReward": return action.hpAmount;
    }
  }

  async function readApproval(action: ApprovalAction, account: Address): Promise<Omit<ApprovalStatus, "requiredAllowance" | "approvalNeeded" | "approvalAmount">> {
    const mapping = action.kind === "claimReward"
      ? { token: "BossHP" as const, tokenAddress: bossHP, spender: "BossHook" as const, spenderAddress: hook, abi: bossHpAbi }
      : action.kind === "enroll"
        ? { token: "MockUSD" as const, tokenAddress: mockUSD, spender: "BossHook" as const, spenderAddress: hook, abi: mockUsdAbi }
        : { token: "MockUSD" as const, tokenAddress: mockUSD, spender: "BossRouter" as const, spenderAddress: router, abi: mockUsdAbi };
    const currentAllowance = await publicClient.readContract({
      address: mapping.tokenAddress,
      abi: mapping.abi,
      functionName: "allowance",
      args: [account, mapping.spenderAddress],
    });
    return { action: action.kind, account, ...mapping, currentAllowance };
  }

  function makePending<T>(pending: {
    hash: Hex;
    kind: PendingActionKind;
    action: string;
    account: Address;
    target: Address;
    calldata: Hex;
    expectedEvents: EventSpec[];
    buildResult(events: readonly DecodedContractEvent[]): T;
  }): PendingOperation<T> {
    return {
      hash: pending.hash,
      action: pending.action,
      request: {
        hash: pending.hash,
        kind: pending.kind,
        chainId: deployment.chainId,
        account: pending.account,
        target: pending.target,
        calldata: pending.calldata,
      },
      wait: async () => {
        let replacement: ReplacementReturnType<Chain | undefined> | undefined;
        let receipt: TransactionReceipt;
        try {
          receipt = await publicClient.waitForTransactionReceipt({
            hash: pending.hash,
            confirmations: 1,
            timeout: timeout,
            onReplaced: (value) => { replacement = value; },
          });
        } catch (error) {
          if (error instanceof WaitForTransactionReceiptTimeoutError) return { status: "unresolved", hash: pending.hash };
          throw error;
        }
        if (replacement) {
          if (
            replacement.reason === "cancelled" || !sameAddress(replacement.transaction.from, pending.account) ||
            !sameAddress(replacement.transaction.to ?? ZERO_ADDRESS, pending.target) ||
            !sameHex(replacement.transaction.input, pending.calldata) ||
            replacement.transaction.value !== 0n ||
            (replacement.transaction.chainId !== null && replacement.transaction.chainId !== undefined && replacement.transaction.chainId !== deployment.chainId)
          ) throw new TransactionReplacedError(pending.hash, replacement.transaction.hash, replacement.reason);
        }
        const transaction = await publicClient.getTransaction({ hash: receipt.transactionHash });
        if (
          !sameAddress(receipt.from, pending.account) || !sameAddress(receipt.to ?? ZERO_ADDRESS, pending.target) ||
          !sameAddress(transaction.from, pending.account) || !sameAddress(transaction.to ?? ZERO_ADDRESS, pending.target) ||
          !sameHex(transaction.input, pending.calldata) || transaction.value !== 0n ||
          (transaction.chainId !== null && transaction.chainId !== undefined && transaction.chainId !== deployment.chainId)
        ) throw new BossPoolSdkError("RECEIPT_MISMATCH", "Mined transaction sender, target, or calldata does not match the requested action.");
        if (receipt.status !== "success") throw new TransactionRevertedError(receipt.transactionHash, receipt);
        const events = decodeExpectedEvents(receipt, pending.expectedEvents);
        const result = pending.buildResult(events);
        return { status: "confirmed", hash: receipt.transactionHash, receipt, replaced: Boolean(replacement), result };
      },
    };
  }
}

export { maxUint256 };

function assertActiveBeforeDeadline(round: RoundSnapshot): void {
  if (round.status !== ACTIVE_STATUS) throw new BossPoolSdkError("ROUND_NOT_ACTIVE", "The round is not Active.");
  if (round.blockTimestamp >= round.deadline) throw new BossPoolSdkError("ROUND_EXPIRED", "The round deadline has passed.");
}

function minimumOutput(value: bigint, slippageBps: number): bigint {
  const floor = value * BigInt(10_000 - slippageBps) / 10_000n;
  return floor > 0n ? floor : 1n;
}

function normalizeQuoteResult(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const fields = value as Record<string, unknown>;
    return {
      mockUSDSpent: asBigInt(fields.mockUSDSpent),
      royBought: asBigInt(fields.royBought),
      roySpent: asBigInt(fields.roySpent),
      bossHPOut: asBigInt(fields.bossHPOut),
      stageCleared: fields.stageCleared === true,
      bossDefeated: fields.bossDefeated === true,
      nextStage: asNumber(fields.nextStage),
    };
  }
  if (Array.isArray(value) && value.length === 7) {
    return {
      mockUSDSpent: asBigInt(value[0]),
      royBought: asBigInt(value[1]),
      roySpent: asBigInt(value[2]),
      bossHPOut: asBigInt(value[3]),
      stageCleared: value[4] === true,
      bossDefeated: value[5] === true,
      nextStage: asNumber(value[6]),
    };
  }
  throw new BossPoolSdkError("INVALID_QUOTE_RESULT", "Router quote returned an unexpected ABI result.");
}

function decodeExpectedEvents(
  receipt: TransactionReceipt,
  specs: readonly EventSpec[],
): readonly DecodedContractEvent[] {
  const decoded: DecodedContractEvent[] = [];
  for (const spec of specs) {
    for (const log of receipt.logs) {
      if (!sameAddress(log.address, spec.address)) continue;
      try {
        const event = decodeEventLog({ abi: spec.abi, data: log.data, topics: log.topics, strict: true });
        if (event.eventName === spec.eventName) {
          decoded.push({
            address: log.address,
            eventName: event.eventName,
            args: event.args,
            transactionHash: log.transactionHash ?? receipt.transactionHash,
            logIndex: Number(log.logIndex ?? BigInt(decoded.length)),
          } as unknown as DecodedContractEvent);
        }
      } catch {
        // Ignore unrelated logs from this verified contract; the required event is checked below.
      }
    }
    if (spec.required !== false && !decoded.some((event) => sameAddress(event.address, spec.address) && event.eventName === spec.eventName)) {
      throw new BossPoolSdkError("RECEIPT_EVENT_MISSING", `Successful receipt omitted expected ${spec.eventName} event.`);
    }
  }
  return decoded;
}

function onlyEvent<Name extends DecodedContractEvent["eventName"]>(
  events: readonly DecodedContractEvent[],
  name: Name,
): Extract<DecodedContractEvent, { eventName: Name }> {
  const matches = events.filter((event) => event.eventName === name);
  if (matches.length !== 1) throw new BossPoolSdkError("RECEIPT_EVENT_AMBIGUOUS", `Expected one ${name} event, found ${matches.length}.`);
  return matches[0] as Extract<DecodedContractEvent, { eventName: Name }>;
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  throw new BossPoolSdkError("INVALID_EVENT_VALUE", "Decoded event value was not an integer.");
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "bigint" && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  throw new BossPoolSdkError("INVALID_EVENT_VALUE", "Decoded event value was not a safe number.");
}

function findContractErrorName(error: unknown): string | undefined {
  const visited = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const record = current as { errorName?: unknown; data?: unknown; raw?: unknown; cause?: unknown };
    if (typeof record.errorName === "string") return record.errorName;
    const data = record.data;
    if (data && typeof data === "object" && typeof (data as { errorName?: unknown }).errorName === "string") {
      return (data as { errorName: string }).errorName;
    }
    const rawData = typeof data === "string" ? data : data && typeof data === "object" ? (data as { data?: unknown }).data : record.raw;
    if (typeof rawData === "string" && /^0x[\da-fA-F]{8,}$/.test(rawData)) {
      try {
        return decodeErrorResult({ abi: bossRouterAbi, data: rawData as Hex }).errorName;
      } catch {
        // The current cause may carry a different contract's custom error.
      }
    }
    current = record.cause;
  }
  return undefined;
}

function assertEventAddress(value: unknown, expected: Address, message: string): void {
  if (typeof value !== "string" || !sameAddress(value as Address, expected)) throw new BossPoolSdkError("RECEIPT_EVENT_MISMATCH", message);
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameHex(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
