import {
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  encodeAbiParameters,
  erc20Abi,
  getCreate2Address,
  isAddress,
  keccak256,
  toHex,
  WaitForTransactionReceiptTimeoutError,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type ReplacementReturnType,
  type Transport,
  type WalletClient,
} from "viem";
import { bossFactoryAbi } from "./generated/abi";
import { bossHookCreationCode, bossRouterCreationCode } from "./generated/bytecode";

const HOOK_FLAGS = 0x2ac0n;
const HOOK_FLAG_MASK = 0x3fffn;
const MAX_HOOK_SALT = 160_444;
const FACTORY_BOSS_ID_ABI = [{ type: "address" }, { type: "bytes32" }] as const;

export type FactoryLaunchConfig = {
  token: Address;
  tokenAllocation: bigint;
  prizeBps: number;
  volumeTargetMockUSD: bigint;
  /** Zero for new Factory bosses. The tuple field also permits decoding historical transactions. */
  deadline: bigint;
  maxAttackTokenPerMockUSDX128: bigint;
};

export type FactoryLaunchQuote = {
  prizeAmount: bigint;
  battleTokenBudget: bigint;
  saleHPBudget: bigint;
  requiredBattleTokenFunding: bigint;
  estimatedAttackToken: bigint;
  stageOneHP: bigint;
  hpPriceTick: number;
  maxRoyPerMockUSDX128: bigint;
};

export type FactoryBuildStatus =
  | { status: "not-deployed" }
  | { status: "compatible" }
  | {
      status: "incompatible";
      routerCodeHash: Hex;
      hookCodeHash: Hex;
      expectedRouterCodeHash: Hex;
      expectedHookCodeHash: Hex;
    };

export type Erc20TokenInfo = {
  address: Address;
  symbol: string;
  decimals: number;
  balance?: bigint;
};

export type FactoryLaunchProgress =
  | { phase: "preparing" }
  | { phase: "mining"; attempts: number }
  | { phase: "submitting" }
  | { phase: "confirming"; hash: Hex };

export type FactoryLaunchResult = {
  hash: Hex;
  bossId: Hex;
  maker: Address;
  token: Address;
  hook: Address;
  router: Address;
  collectibles: Address;
};

export class BossFactorySdkError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BossFactorySdkError";
    this.code = code;
  }
}

type FactoryLaunchConfigRecord = Omit<FactoryLaunchConfig,
  "tokenAllocation" | "volumeTargetMockUSD" | "deadline" | "maxAttackTokenPerMockUSDX128"
> & {
  tokenAllocation: string;
  volumeTargetMockUSD: string;
  deadline: string;
  maxAttackTokenPerMockUSDX128: string;
};

export type FactoryPendingOperation = {
  version: 1;
  kind: "approval";
  chainId: number;
  hash: Hex;
  account: Address;
  factory: Address;
  token: Address;
  amount: string;
  calldata: Hex;
  submittedAt: number;
} | {
  version: 1;
  kind: "launch";
  chainId: number;
  hash: Hex;
  account: Address;
  factory: Address;
  bossId: Hex;
  userSalt: Hex;
  config: FactoryLaunchConfigRecord;
  expected: { prizeAmount: string; hpPriceTick: number };
  calldata: Hex;
  submittedAt: number;
};

export type FactoryOperationResult =
  | { kind: "approval"; hash: Hex; token: Address; allowance?: bigint }
  | { kind: "launch"; result: FactoryLaunchResult };

export class FactoryOperationPendingError extends BossFactorySdkError {
  readonly operation: FactoryPendingOperation;

  constructor(operation: FactoryPendingOperation) {
    super("FACTORY_OPERATION_PENDING", "The transaction is still pending. Resume receipt checking before starting another Factory transaction.");
    this.name = "FactoryOperationPendingError";
    this.operation = operation;
  }
}

export class FactoryOperationTerminalError extends BossFactorySdkError {
  readonly operation: FactoryPendingOperation;

  constructor(operation: FactoryPendingOperation, code: string, message: string) {
    super(code, message);
    this.name = "FactoryOperationTerminalError";
    this.operation = operation;
  }
}

export function parseFactoryPendingOperation(value: unknown): FactoryPendingOperation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || !positiveSafeInteger(record.chainId) ||
      !isHash(record.hash) || !isAddressValue(record.account) || !isAddressValue(record.factory) ||
      !isHexData(record.calldata) || !positiveSafeInteger(record.submittedAt)) return undefined;
  if (record.kind === "approval") {
    if (!isAddressValue(record.token) || !isDecimal(record.amount)) return undefined;
    return value as FactoryPendingOperation;
  }
  if (record.kind !== "launch" || !isHash(record.bossId) || !isHash(record.userSalt) ||
      !record.config || typeof record.config !== "object" || !record.expected || typeof record.expected !== "object") return undefined;
  const config = record.config as Record<string, unknown>;
  const expected = record.expected as Record<string, unknown>;
  if (!isAddressValue(config.token) || !isDecimal(config.tokenAllocation) || !isDecimal(config.volumeTargetMockUSD) ||
      !isDecimal(config.deadline) || !isDecimal(config.maxAttackTokenPerMockUSDX128) ||
      !Number.isInteger(config.prizeBps) || (config.prizeBps as number) <= 0 || (config.prizeBps as number) >= 10_000 ||
      !isDecimal(expected.prizeAmount) || !Number.isInteger(expected.hpPriceTick)) return undefined;
  return value as FactoryPendingOperation;
}

export type BossFactorySdkOptions = {
  publicClient: PublicClient;
  factory: Address;
  walletClient?: WalletClient<Transport, Chain | undefined, Account | undefined>;
  routerCode?: Hex;
  hookCode?: Hex;
};

export async function readErc20TokenInfo(
  publicClient: PublicClient,
  token: Address,
  account?: Address,
): Promise<Erc20TokenInfo> {
  const code = await publicClient.getCode({ address: token });
  if (!code || code === "0x") throw new BossFactorySdkError("TOKEN_NOT_FOUND", "No token contract exists at this address.");

  const [symbol, decimals, balance] = await Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }).catch(() => undefined),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }).catch(() => undefined),
    account
      ? publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] })
      : Promise.resolve(undefined),
  ]);

  if (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new BossFactorySdkError("TOKEN_DECIMALS_UNAVAILABLE", "This form needs the token's ERC-20 decimals() value.");
  }
  return {
    address: token,
    symbol: typeof symbol === "string" && symbol.trim() ? symbol.trim() : `${token.slice(0, 6)}…${token.slice(-4)}`,
    decimals,
    balance,
  };
}

export function createBossFactorySdk(options: BossFactorySdkOptions) {
  const factory = options.factory;
  const publicClient = options.publicClient;
  const routerCode = options.routerCode ?? bossRouterCreationCode as Hex;
  const hookCode = options.hookCode ?? bossHookCreationCode as Hex;

  if (!isAddress(factory, { strict: false })) throw new BossFactorySdkError("INVALID_FACTORY_ADDRESS", "Factory address is invalid.");
  if (publicClient.chain?.id !== undefined && options.walletClient?.chain?.id !== undefined &&
      publicClient.chain.id !== options.walletClient.chain.id) {
    throw new BossFactorySdkError("CLIENT_CHAIN_MISMATCH", "Factory reader and wallet are configured for different chains.");
  }

  async function checkFactoryBuild(): Promise<FactoryBuildStatus> {
    const code = await publicClient.getCode({ address: factory });
    if (!code || code === "0x") return { status: "not-deployed" };
    const [routerCodeHash, hookCodeHash] = await Promise.all([
      publicClient.readContract({ address: factory, abi: bossFactoryAbi, functionName: "routerCodeHash" }) as Promise<Hex>,
      publicClient.readContract({ address: factory, abi: bossFactoryAbi, functionName: "hookCodeHash" }) as Promise<Hex>,
    ]);
    const expectedRouterCodeHash = keccak256(routerCode);
    const expectedHookCodeHash = keccak256(hookCode);
    return sameHex(routerCodeHash, expectedRouterCodeHash) && sameHex(hookCodeHash, expectedHookCodeHash)
      ? { status: "compatible" }
      : { status: "incompatible", routerCodeHash, hookCodeHash, expectedRouterCodeHash, expectedHookCodeHash };
  }

  async function ensureFactory(): Promise<void> {
    const status = await checkFactoryBuild();
    if (status.status === "not-deployed") {
      throw new BossFactorySdkError("FACTORY_NOT_DEPLOYED", "No Boss Factory is deployed at the configured address.");
    }
    if (status.status === "incompatible") {
      throw new BossFactorySdkError("FACTORY_BUILD_MISMATCH", "This Boss Factory uses different Router/Hook bytecode. Deploy the Factory build that matches this app before quoting or approving a launch.");
    }
  }

  async function requireWallet(): Promise<{
    wallet: NonNullable<BossFactorySdkOptions["walletClient"]>;
    account: Address;
    writeAccount: Account | Address;
  }> {
    const wallet = options.walletClient;
    if (!wallet) throw new BossFactorySdkError("WALLET_REQUIRED", "Connect a wallet on the selected network.");
    const [walletChain, accounts] = await Promise.all([wallet.getChainId(), wallet.getAddresses()]);
    const expectedChain = await publicClient.getChainId();
    if (walletChain !== expectedChain) throw new BossFactorySdkError("WRONG_WALLET_CHAIN", `Switch the wallet to chain ${expectedChain}.`);
    const configuredAccount = wallet.account;
    const configured = typeof configuredAccount === "string" ? configuredAccount : configuredAccount?.address;
    let account: Address;
    if (configured) {
      const localSigner = typeof configuredAccount === "object" && configuredAccount.type === "local";
      if (localSigner) {
        account = configured;
      } else {
        if (!accounts[0] || !sameAddress(accounts[0], configured)) {
          throw new BossFactorySdkError("WALLET_ACCOUNT_CHANGED", "Configured JSON-RPC account is no longer the wallet's first selected account.");
        }
        account = accounts[0];
      }
    } else {
      const selected = accounts[0];
      if (!selected) throw new BossFactorySdkError("WALLET_ACCOUNT_CHANGED", "The selected wallet account is unavailable.");
      account = selected;
    }
    return { wallet, account, writeAccount: wallet.account ?? account };
  }

  async function quoteLaunch(config: FactoryLaunchConfig): Promise<FactoryLaunchQuote> {
    await ensureFactory();
    return readLaunchQuote(config);
  }

  async function readLaunchQuote(config: FactoryLaunchConfig): Promise<FactoryLaunchQuote> {
    return await publicClient.readContract({
      address: factory,
      abi: bossFactoryAbi,
      functionName: "quoteLaunch",
      args: [config],
    }) as FactoryLaunchQuote;
  }

  async function tokenAllowance(token: Address, owner: Address): Promise<bigint> {
    return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, factory] });
  }

  async function approveToken(
    token: Address,
    amount: bigint,
    onSubmitted?: (operation: FactoryPendingOperation) => void,
  ): Promise<Hex | null> {
    if (amount <= 0n) throw new BossFactorySdkError("INVALID_APPROVAL_AMOUNT", "Approval amount must be positive.");
    await ensureFactory();
    const { account } = await requireWallet();
    const current = await tokenAllowance(token, account);
    if (current >= amount) return null;
    if (current > 0n) await sendApproval(token, account, 0n, onSubmitted);
    return sendApproval(token, account, amount, onSubmitted);
  }

  async function sendApproval(
    token: Address,
    account: Address,
    amount: bigint,
    onSubmitted?: (operation: FactoryPendingOperation) => void,
  ): Promise<Hex> {
    const { wallet, account: currentAccount } = await requireWallet();
    if (currentAccount.toLowerCase() !== account.toLowerCase()) {
      throw new BossFactorySdkError("WALLET_ACCOUNT_CHANGED", "The selected wallet account changed during approval.");
    }
    await publicClient.simulateContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [factory, amount],
      account,
    });
    const checkedWallet = await requireWallet();
    if (checkedWallet.account.toLowerCase() !== account.toLowerCase()) {
      throw new BossFactorySdkError("WALLET_ACCOUNT_CHANGED", "The selected wallet account changed during approval preparation.");
    }
    const chainId = await publicClient.getChainId();
    const calldata = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [factory, amount] });
    const hash = await wallet.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [factory, amount],
      account: checkedWallet.writeAccount,
      chain: wallet.chain,
    });
    const operation: FactoryPendingOperation = {
      version: 1,
      kind: "approval",
      chainId,
      hash,
      account,
      factory,
      token,
      amount: amount.toString(),
      calldata,
      submittedAt: Date.now(),
    };
    onSubmitted?.(operation);
    const { receipt } = await waitForFactoryReceipt(publicClient, operation, 120_000);
    if (receipt.status !== "success") {
      throw new FactoryOperationTerminalError(operation, "APPROVAL_REVERTED", "The token approval transaction reverted.");
    }
    assertApprovalEvent(receipt, operation);
    return receipt.transactionHash;
  }

  async function launchBoss(
    config: FactoryLaunchConfig,
    onProgress?: (progress: FactoryLaunchProgress) => void,
    onSubmitted?: (operation: FactoryPendingOperation) => void,
  ): Promise<FactoryLaunchResult> {
    await ensureFactory();
    const { account } = await requireWallet();
    onProgress?.({ phase: "preparing" });
    if (config.maxAttackTokenPerMockUSDX128 <= 0n) {
      throw new BossFactorySdkError("ACCEPTED_RATE_REQUIRED", "Request a quote and use its accepted attack-token rate before launching.");
    }

    const tokenInfo = await readErc20TokenInfo(publicClient, config.token, account);
    if (tokenInfo.balance === undefined || tokenInfo.balance < config.tokenAllocation) {
      throw new BossFactorySdkError("INSUFFICIENT_TOKEN_BALANCE", "Wallet token balance is below the selected launch allocation.");
    }
    if (await tokenAllowance(config.token, account) < config.tokenAllocation) {
      throw new BossFactorySdkError("TOKEN_APPROVAL_REQUIRED", "Approve the selected MEME allocation to the Boss Factory first.");
    }
    const expectedQuote = await readLaunchQuote(config);
    if (expectedQuote.maxRoyPerMockUSDX128 !== config.maxAttackTokenPerMockUSDX128) {
      throw new BossFactorySdkError("ACCEPTED_RATE_MISMATCH", "The accepted attack-token rate no longer matches the Factory quote. Request a fresh quote.");
    }

    const userSalt = await uniqueUserSalt(account);
    const initCode = await publicClient.readContract({
      address: factory,
      abi: bossFactoryAbi,
      functionName: "hookInitCode",
      args: [account, userSalt, config, routerCode, hookCode],
    });
    const hookSalt = await mineHookSalt(factory, initCode, publicClient, onProgress);

    const launchArgs = [config, userSalt, hookSalt, routerCode, hookCode] as const;
    const calldata = encodeFunctionData({ abi: bossFactoryAbi, functionName: "launchBoss", args: launchArgs });
    const bossId = keccak256(encodeAbiParameters(FACTORY_BOSS_ID_ABI, [account, userSalt]));
    const chainId = await publicClient.getChainId();
    const checkedWallet = await requireWallet();
    if (checkedWallet.account.toLowerCase() !== account.toLowerCase()) {
      throw new BossFactorySdkError("WALLET_ACCOUNT_CHANGED", "The selected wallet account changed while preparing the launch. Request a new quote.");
    }
    await publicClient.simulateContract({
      address: factory,
      abi: bossFactoryAbi,
      functionName: "launchBoss",
      args: launchArgs,
      account,
    });
    onProgress?.({ phase: "submitting" });
    const finalWallet = await requireWallet();
    if (finalWallet.account.toLowerCase() !== account.toLowerCase()) {
      throw new BossFactorySdkError("WALLET_ACCOUNT_CHANGED", "The selected wallet account changed before the launch was sent.");
    }
    const hash = await finalWallet.wallet.writeContract({
      address: factory,
      abi: bossFactoryAbi,
      functionName: "launchBoss",
      args: launchArgs,
      account: finalWallet.writeAccount,
      chain: finalWallet.wallet.chain,
    });
    const operation: FactoryPendingOperation = {
      version: 1,
      kind: "launch",
      chainId,
      hash,
      account,
      factory,
      bossId,
      userSalt,
      config: toConfigRecord(config),
      expected: { prizeAmount: expectedQuote.prizeAmount.toString(), hpPriceTick: expectedQuote.hpPriceTick },
      calldata,
      submittedAt: Date.now(),
    };
    onSubmitted?.(operation);
    onProgress?.({ phase: "confirming", hash });
    const result = await resumeOperation(operation);
    if (result.kind !== "launch") throw new BossFactorySdkError("INVALID_OPERATION_RESULT", "Factory launch recovery returned an approval result.");
    return result.result;
  }

  async function resumeOperation(value: FactoryPendingOperation): Promise<FactoryOperationResult> {
    const operation = parseFactoryPendingOperation(value);
    if (!operation) throw new BossFactorySdkError("INVALID_PENDING_OPERATION", "Saved Factory operation data is invalid; keep it for recovery and check the transaction manually.");
    const chainId = await publicClient.getChainId();
    if (operation.chainId !== chainId || !sameAddress(operation.factory, factory)) {
      throw new BossFactorySdkError("OPERATION_NETWORK_MISMATCH", "Saved Factory operation belongs to a different chain or Factory.");
    }
    const { receipt } = await waitForFactoryReceipt(publicClient, operation, 120_000);
    if (receipt.status !== "success") {
      const label = operation.kind === "launch" ? "launch" : "approval";
      throw new FactoryOperationTerminalError(operation, `${label.toUpperCase()}_REVERTED`, `The Factory ${label} transaction reverted.`);
    }
    if (operation.kind === "approval") {
      assertApprovalEvent(receipt, operation);
      const allowance = await tokenAllowance(operation.token, operation.account).catch(() => undefined);
      return { kind: "approval", hash: receipt.transactionHash, token: operation.token, allowance };
    }
    return { kind: "launch", result: decodeLaunchResult(receipt, operation) };
  }

  async function uniqueUserSalt(maker: Address): Promise<Hex> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const random = globalThis.crypto.getRandomValues(new Uint8Array(32));
      const salt = toHex(random);
      const bossId = keccak256(encodeAbiParameters(FACTORY_BOSS_ID_ABI, [maker, salt]));
      const existing = await publicClient.readContract({ address: factory, abi: bossFactoryAbi, functionName: "bosses", args: [bossId] });
      if (existing.toLowerCase() === "0x0000000000000000000000000000000000000000") return salt;
    }
    throw new BossFactorySdkError("SALT_COLLISION", "Could not find an unused launch ID. Try again.");
  }

  return {
    factory,
    checkFactoryBuild,
    readToken: (token: Address, account?: Address) => readErc20TokenInfo(publicClient, token, account),
    quoteLaunch,
    tokenAllowance,
    approveToken,
    launchBoss,
    resumeOperation,
    withWallet: (walletClient: BossFactorySdkOptions["walletClient"]) =>
      createBossFactorySdk({ ...options, walletClient }),
  };
}

export type BossFactorySdk = ReturnType<typeof createBossFactorySdk>;

async function waitForFactoryReceipt(
  publicClient: PublicClient,
  operation: FactoryPendingOperation,
  timeout: number,
) {
  let replacement: ReplacementReturnType<Chain | undefined> | undefined;
  let receipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({
      hash: operation.hash,
      confirmations: 1,
      timeout,
      onReplaced: (value) => { replacement = value; },
    });
  } catch (error) {
    if (error instanceof WaitForTransactionReceiptTimeoutError) throw new FactoryOperationPendingError(operation);
    throw error;
  }

  if (replacement && (replacement.reason === "cancelled" || !matchesFactoryTransaction(replacement.transaction, operation))) {
    const reason = replacement.reason === "cancelled" ? "cancelled" : "replaced by a different transaction";
    throw new FactoryOperationTerminalError(operation, "TRANSACTION_REPLACED", `The Factory transaction was ${reason}; the original operation did not confirm.`);
  }
  const transaction = await publicClient.getTransaction({ hash: receipt.transactionHash });
  if (!matchesFactoryTransaction(transaction, operation) ||
      !sameAddress(receipt.from, operation.account) || !sameAddress(receipt.to ?? ZERO_ADDRESS, targetOf(operation))) {
    throw new BossFactorySdkError("FACTORY_RECEIPT_MISMATCH", "The mined transaction does not match the saved Factory request. Keep it saved and resume later.");
  }
  return { receipt, replaced: Boolean(replacement) };
}

function matchesFactoryTransaction(
  transaction: { from: Address; to: Address | null; input: Hex; value: bigint; chainId?: number | null },
  operation: FactoryPendingOperation,
): boolean {
  return sameAddress(transaction.from, operation.account) &&
    sameAddress(transaction.to ?? ZERO_ADDRESS, targetOf(operation)) &&
    sameHex(transaction.input, operation.calldata) && transaction.value === 0n &&
    (transaction.chainId === null || transaction.chainId === operation.chainId);
}

function targetOf(operation: FactoryPendingOperation): Address {
  return operation.kind === "launch" ? operation.factory : operation.token;
}

function decodeLaunchResult(receipt: Awaited<ReturnType<PublicClient["waitForTransactionReceipt"]>>, operation: Extract<FactoryPendingOperation, { kind: "launch" }>): FactoryLaunchResult {
  assertLaunchCall(operation);
  const events = [];
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, operation.factory)) continue;
    try {
      const event = decodeEventLog({ abi: bossFactoryAbi, data: log.data, topics: log.topics, strict: true });
      if (event.eventName === "BossLaunched") events.push(event);
    } catch {
      // Ignore unrelated Factory logs; the expected event is checked below.
    }
  }
  if (events.length !== 1) {
    throw new BossFactorySdkError("LAUNCH_EVENT_UNKNOWN", `Expected one BossLaunched event, found ${events.length}. Keep the transaction saved and resume later.`);
  }
  const event = events[0]!;
  const expectedBossId = keccak256(encodeAbiParameters(FACTORY_BOSS_ID_ABI, [operation.account, operation.userSalt]));
  if (!sameHex(event.args.bossId, operation.bossId) || !sameHex(event.args.bossId, expectedBossId) ||
      !sameAddress(event.args.maker, operation.account) || !sameAddress(event.args.token, operation.config.token) ||
      event.args.tokenAllocation !== BigInt(operation.config.tokenAllocation) ||
      event.args.prizeAmount !== BigInt(operation.expected.prizeAmount) ||
      event.args.volumeTargetMockUSD !== BigInt(operation.config.volumeTargetMockUSD) ||
      event.args.hpPriceTick !== operation.expected.hpPriceTick) {
    throw new BossFactorySdkError("LAUNCH_EVENT_MISMATCH", "BossLaunched does not match the saved launch config. Keep the transaction saved and resume later.");
  }
  return {
    hash: receipt.transactionHash,
    bossId: event.args.bossId,
    maker: event.args.maker,
    token: event.args.token,
    hook: event.args.hook,
    router: event.args.router,
    collectibles: event.args.collectibles,
  };
}

function assertApprovalEvent(
  receipt: Awaited<ReturnType<PublicClient["waitForTransactionReceipt"]>>,
  operation: Extract<FactoryPendingOperation, { kind: "approval" }>,
): void {
  const expectedAmount = BigInt(operation.amount);
  const call = decodeFunctionData({ abi: erc20Abi, data: operation.calldata });
  if (call.functionName !== "approve" || !sameAddress(call.args[0], operation.factory) || call.args[1] !== expectedAmount) {
    throw new BossFactorySdkError("APPROVAL_CALL_UNKNOWN", "Saved approval calldata does not match its owner, spender, and amount record. Keep it saved and resume later.");
  }
  const matches = [];
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, operation.token)) continue;
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, strict: true });
      if (event.eventName === "Approval" && sameAddress(event.args.owner, operation.account) &&
          sameAddress(event.args.spender, operation.factory) && event.args.value === expectedAmount) matches.push(event);
    } catch {
      // Ignore unrelated ERC-20 logs; an exact Approval event is required below.
    }
  }
  if (matches.length !== 1) {
    throw new BossFactorySdkError("APPROVAL_EVENT_UNKNOWN", "The approval receipt did not prove the saved owner, spender, and amount. Keep it saved and resume later.");
  }
}

function assertLaunchCall(operation: Extract<FactoryPendingOperation, { kind: "launch" }>): void {
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: bossFactoryAbi, data: operation.calldata });
  } catch {
    throw new BossFactorySdkError("LAUNCH_CALL_UNKNOWN", "Saved launch calldata could not be decoded. Keep it saved and resume later.");
  }
  if (decoded.functionName !== "launchBoss") {
    throw new BossFactorySdkError("LAUNCH_CALL_UNKNOWN", "Saved transaction calldata is not a Boss Factory launch. Keep it saved and resume later.");
  }
  const [config, userSalt] = decoded.args;
  if (!sameHex(userSalt, operation.userSalt) || !sameAddress(config.token, operation.config.token) ||
      config.tokenAllocation !== BigInt(operation.config.tokenAllocation) || config.prizeBps !== operation.config.prizeBps ||
      config.volumeTargetMockUSD !== BigInt(operation.config.volumeTargetMockUSD) || config.deadline !== BigInt(operation.config.deadline) ||
      config.maxAttackTokenPerMockUSDX128 !== BigInt(operation.config.maxAttackTokenPerMockUSDX128)) {
    throw new BossFactorySdkError("LAUNCH_CALL_MISMATCH", "Saved launch calldata does not match its recorded config. Keep it saved and resume later.");
  }
}

function toConfigRecord(config: FactoryLaunchConfig): FactoryLaunchConfigRecord {
  return {
    token: config.token,
    tokenAllocation: config.tokenAllocation.toString(),
    prizeBps: config.prizeBps,
    volumeTargetMockUSD: config.volumeTargetMockUSD.toString(),
    deadline: config.deadline.toString(),
    maxAttackTokenPerMockUSDX128: config.maxAttackTokenPerMockUSDX128.toString(),
  };
}

function isHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-fA-F]{64}$/.test(value);
}

function isHexData(value: unknown): value is Hex {
  return typeof value === "string" && /^0x(?:[\da-fA-F]{2})+$/.test(value);
}

function isAddressValue(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value, { strict: false });
}

function isDecimal(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameHex(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

async function mineHookSalt(
  deployer: Address,
  initCode: Hex,
  publicClient: PublicClient,
  onProgress?: (progress: FactoryLaunchProgress) => void,
): Promise<Hex> {
  const initCodeHash = keccak256(initCode);
  for (let attempt = 0; attempt < MAX_HOOK_SALT; attempt++) {
    if ((attempt & 4095) === 0) {
      onProgress?.({ phase: "mining", attempts: attempt });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const salt = toHex(BigInt(attempt), { size: 32 });
    const address = getCreate2Address({ from: deployer, salt, bytecodeHash: initCodeHash });
    if ((BigInt(address) & HOOK_FLAG_MASK) !== HOOK_FLAGS) continue;
    const code = await publicClient.getCode({ address });
    if (!code || code === "0x") return salt;
  }
  throw new BossFactorySdkError("HOOK_SALT_NOT_FOUND", "Could not find a valid v4 hook address within the salt search bound.");
}
