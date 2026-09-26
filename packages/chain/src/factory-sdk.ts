import {
  decodeEventLog,
  encodeAbiParameters,
  erc20Abi,
  getCreate2Address,
  isAddress,
  keccak256,
  toHex,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
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
  deadline: bigint;
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

export type BossFactorySdkOptions = {
  publicClient: PublicClient;
  factory: Address;
  walletClient?: WalletClient<Transport, Chain | undefined, Account | undefined>;
  routerCode?: Hex;
  hookCode?: Hex;
};

export class BossFactorySdkError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "BossFactorySdkError";
    this.code = code;
  }
}

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

  async function ensureFactory(): Promise<void> {
    const code = await publicClient.getCode({ address: factory });
    if (!code || code === "0x") throw new BossFactorySdkError("FACTORY_NOT_DEPLOYED", "No Boss Factory is deployed at the configured address.");
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
    const configured = typeof wallet.account === "string" ? wallet.account : wallet.account?.address;
    const account = configured ?? accounts[0];
    if (!account || !accounts.some((candidate) => candidate.toLowerCase() === account.toLowerCase())) {
      throw new BossFactorySdkError("WALLET_ACCOUNT_CHANGED", "The selected wallet account is unavailable.");
    }
    return { wallet, account, writeAccount: wallet.account ?? account };
  }

  async function quoteLaunch(config: FactoryLaunchConfig): Promise<FactoryLaunchQuote> {
    await ensureFactory();
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

  async function approveToken(token: Address, amount: bigint): Promise<Hex | null> {
    if (amount <= 0n) throw new BossFactorySdkError("INVALID_APPROVAL_AMOUNT", "Approval amount must be positive.");
    await ensureFactory();
    const { account } = await requireWallet();
    const current = await tokenAllowance(token, account);
    if (current >= amount) return null;
    if (current > 0n) await sendApproval(token, account, 0n);
    const hash = await sendApproval(token, account, amount);
    if (await tokenAllowance(token, account) < amount) {
      throw new BossFactorySdkError("APPROVAL_FAILED", "The Factory did not receive the required token allowance.");
    }
    return hash;
  }

  async function sendApproval(token: Address, account: Address, amount: bigint): Promise<Hex> {
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
    const hash = await wallet.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [factory, amount],
      account: checkedWallet.writeAccount,
      chain: wallet.chain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") throw new BossFactorySdkError("APPROVAL_FAILED", "The token approval transaction reverted.");
    return hash;
  }

  async function launchBoss(
    config: FactoryLaunchConfig,
    onProgress?: (progress: FactoryLaunchProgress) => void,
  ): Promise<FactoryLaunchResult> {
    await ensureFactory();
    const { account } = await requireWallet();
    onProgress?.({ phase: "preparing" });

    const tokenInfo = await readErc20TokenInfo(publicClient, config.token, account);
    if (tokenInfo.balance === undefined || tokenInfo.balance < config.tokenAllocation) {
      throw new BossFactorySdkError("INSUFFICIENT_TOKEN_BALANCE", "Wallet token balance is below the selected launch allocation.");
    }
    if (await tokenAllowance(config.token, account) < config.tokenAllocation) {
      throw new BossFactorySdkError("TOKEN_APPROVAL_REQUIRED", "Approve the selected MEME allocation to the Boss Factory first.");
    }

    const [expectedRouterHash, expectedHookHash] = await Promise.all([
      publicClient.readContract({ address: factory, abi: bossFactoryAbi, functionName: "routerCodeHash" }),
      publicClient.readContract({ address: factory, abi: bossFactoryAbi, functionName: "hookCodeHash" }),
    ]);
    if (keccak256(routerCode).toLowerCase() !== expectedRouterHash.toLowerCase() ||
        keccak256(hookCode).toLowerCase() !== expectedHookHash.toLowerCase()) {
      throw new BossFactorySdkError("FACTORY_BUILD_MISMATCH", "This app's contract bytecode does not match the configured Factory build.");
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
    onProgress?.({ phase: "confirming", hash });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") throw new BossFactorySdkError("LAUNCH_REVERTED", "The launch transaction reverted.");

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== factory.toLowerCase()) continue;
      try {
        const event = decodeEventLog({ abi: bossFactoryAbi, data: log.data, topics: log.topics, strict: true });
        if (event.eventName !== "BossLaunched") continue;
        if (event.args.maker.toLowerCase() !== account.toLowerCase() ||
            event.args.token.toLowerCase() !== config.token.toLowerCase()) break;
        return {
          hash: receipt.transactionHash,
          bossId: event.args.bossId,
          maker: event.args.maker,
          token: event.args.token,
          hook: event.args.hook,
          router: event.args.router,
          collectibles: event.args.collectibles,
        };
      } catch {
        // Ignore other logs from the Factory transaction.
      }
    }
    throw new BossFactorySdkError("LAUNCH_EVENT_MISSING", "Launch succeeded but the expected BossLaunched event was missing.");
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
    readToken: (token: Address, account?: Address) => readErc20TokenInfo(publicClient, token, account),
    quoteLaunch,
    tokenAllowance,
    approveToken,
    launchBoss,
    withWallet: (walletClient: BossFactorySdkOptions["walletClient"]) =>
      createBossFactorySdk({ ...options, walletClient }),
  };
}

export type BossFactorySdk = ReturnType<typeof createBossFactorySdk>;

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
