import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createPublicClient,
  defineChain,
  formatEther,
  http,
  isAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  bossCollectiblesAbi,
  bossHpAbi,
  bossPoolHookAbi,
  bossRouterAbi,
  mockUsdAbi,
  royTokenAbi,
} from "@boss-pool/chain";

export const ROBINHOOD_CHAIN_ID = 46_630;
export const DEFAULT_ROBINHOOD_RPC_URL = "https://rpc.testnet.chain.robinhood.com/rpc";
export const TESTNET_MANIFEST_PATH = path.join(
  process.cwd(),
  "apps/web/public/deployments/robinhood-testnet.json",
);
export const CONTRACTS_DIR = path.join(process.cwd(), "contracts");

export type TestnetConfig = {
  rpcUrl: string;
  deployerKey: Hex;
  playerBKey: Hex;
  deployerAddress: Address;
  playerBAddress: Address;
  client: PublicClient;
};

export type DeploymentSummary = {
  chainId: number;
  deployer: Address;
  addresses: {
    hook: Address;
    router: Address;
    bossHP: Address;
    roy: Address;
    mockUSD: Address;
    collectibles: Address;
    poolManager: Address;
  };
  pools: unknown;
  config: unknown;
  prefunded: unknown;
};

export function loadTestnetConfig(): TestnetConfig {
  const { rpcUrl, client } = loadTestnetPublicConfig();

  const deployerKey = readPrivateKey("TESTNET_DEPLOYER_PRIVATE_KEY");
  const playerBKey = readPrivateKey("TESTNET_PLAYER_PRIVATE_KEY");
  let deployerAddress: Address;
  let playerBAddress: Address;
  try {
    deployerAddress = privateKeyToAccount(deployerKey).address;
    playerBAddress = privateKeyToAccount(playerBKey).address;
  } catch {
    throw new Error("The configured test-only private key is invalid.");
  }
  if (deployerAddress.toLowerCase() === playerBAddress.toLowerCase()) {
    throw new Error("TESTNET_PLAYER_PRIVATE_KEY must identify a second test wallet.");
  }

  return { rpcUrl, deployerKey, playerBKey, deployerAddress, playerBAddress, client };
}

export function loadTestnetPublicConfig(): { rpcUrl: string; client: PublicClient } {
  const rpcUrl = process.env.ROBINHOOD_RPC_URL ?? DEFAULT_ROBINHOOD_RPC_URL;
  let url: URL;
  try {
    url = new URL(rpcUrl);
  } catch {
    throw new Error("ROBINHOOD_RPC_URL must be a valid HTTPS endpoint.");
  }
  if (url.protocol !== "https:" || !url.hostname) throw new Error("ROBINHOOD_RPC_URL must be an HTTPS endpoint.");
  const chain = defineChain({
    id: ROBINHOOD_CHAIN_ID,
    name: "Robinhood Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl, { retryCount: 0, timeout: 10_000 }),
  });
  return { rpcUrl, client };
}

export function readPrivateKey(name: string): Hex {
  const value = process.env[name];
  if (!value || !/^0x[\da-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be set to a test-only 32-byte key in the ignored environment file.`);
  }
  return value as Hex;
}

export async function assertRobinhoodChain(client: PublicClient): Promise<bigint> {
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch {
    throw new Error("Could not reach the configured Robinhood RPC endpoint.");
  }
  if (chainId !== ROBINHOOD_CHAIN_ID) {
    throw new Error(`Refusing testnet operation on chain ${chainId}; expected ${ROBINHOOD_CHAIN_ID}.`);
  }
  return client.getBlockNumber({ cacheTime: 0 });
}

export function publicRpcLabel(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  return `${url.protocol}//${url.host}`;
}

export async function assertCancunTransientStorage(client: PublicClient): Promise<void> {
  try {
    const result = await client.call({ data: "0x602a60005d60005c60005260206000f3" });
    if (result.data !== `0x${"0".repeat(62)}2a`) throw new Error("unexpected probe result");
  } catch {
    throw new Error("The RPC endpoint failed the Cancun TSTORE/TLOAD eth_call probe.");
  }
}

export async function runDeploymentScript(config: TestnetConfig, broadcast: boolean): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "boss-pool-testnet-forge-"));
  let forkBlock: bigint;
  try {
    const head = await config.client.getBlockNumber({ cacheTime: 0 });
    forkBlock = head > 20n ? head - 20n : head;
    await config.client.getBlock({ blockNumber: forkBlock });
    const [forkNonce, latestNonce, pendingNonce] = await Promise.all([
      config.client.getTransactionCount({ address: config.deployerAddress, blockNumber: forkBlock }),
      config.client.getTransactionCount({ address: config.deployerAddress, blockTag: "latest" }),
      config.client.getTransactionCount({ address: config.deployerAddress, blockTag: "pending" }),
    ]);
    if (forkNonce !== latestNonce || latestNonce !== pendingNonce) {
      throw new Error("Deployer nonce changed within the selected fork window; wait for pending transactions to settle and rerun.");
    }
  } catch {
    await rm(tempRoot, { recursive: true, force: true });
    throw new Error("Could not select a stable fork with a settled deployer nonce; wait for pending transactions to settle and rerun.");
  }
  const args = [
    "script",
    "script/DeployBossPool.s.sol:DeployBossPool",
    "--chain",
    String(ROBINHOOD_CHAIN_ID),
    "--rpc-url",
    "robinhood",
    "--fork-block-number",
    forkBlock.toString(),
    "--sender",
    config.deployerAddress,
    "--non-interactive",
    "--cache-path",
    path.join(tempRoot, "cache"),
    "--out",
    path.join(tempRoot, "out"),
  ];
  if (broadcast) args.push("--broadcast", "--slow");

  try {
    return execFileSync("forge", args, {
      cwd: CONTRACTS_DIR,
      encoding: "utf8",
      timeout: 900_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ROBINHOOD_RPC_URL: config.rpcUrl },
    });
  } catch (error) {
    const result = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    const details = sanitizeSecrets(`${result.stderr ?? ""}\n${result.stdout ?? ""}\n${result.message ?? ""}`);
    throw new Error(`Forge ${broadcast ? "broadcast" : "dry-run"} failed: ${details.trim().slice(-1200)}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

export function parseDeploymentSummary(output: string): DeploymentSummary {
  const line = output.split(/\r?\n/).find((value) => value.includes("BOSS_POOL_DEPLOYMENT_JSON="));
  if (!line) throw new Error("Forge completed without the deployment summary marker.");
  const marker = "BOSS_POOL_DEPLOYMENT_JSON=";
  let summary: unknown;
  try {
    summary = JSON.parse(line.slice(line.indexOf(marker) + marker.length));
  } catch {
    throw new Error("Forge deployment summary was not valid JSON.");
  }
  if (!summary || typeof summary !== "object") throw new Error("Forge deployment summary is invalid.");
  const value = summary as Record<string, unknown>;
  const addresses = value.addresses as Record<string, unknown> | undefined;
  const requiredAddresses = ["hook", "router", "bossHP", "roy", "mockUSD", "collectibles", "poolManager"];
  if (
    value.chainId !== ROBINHOOD_CHAIN_ID ||
    !addresses || requiredAddresses.some((key) => !isAddressValue(addresses[key])) ||
    !isAddressValue(value.deployer) || !value.pools || !value.config || !value.prefunded
  ) throw new Error("Forge deployment summary does not match the expected testnet deployment shape.");
  return value as unknown as DeploymentSummary;
}

function isAddressValue(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value);
}

export type ReceiptEvidence = {
  transactionHash: Hex;
  blockNumber: number;
  status: "success";
  gasUsed?: string;
  contractAddress?: Address;
};

export async function readRouterCreationReceipt(summary: DeploymentSummary) {
  const pathToBroadcast = path.join(
    CONTRACTS_DIR,
    `broadcast/DeployBossPool.s.sol/${ROBINHOOD_CHAIN_ID}/run-latest.json`,
  );
  let broadcast: { receipts?: Array<Record<string, unknown>> };
  try {
    broadcast = JSON.parse(await Bun.file(pathToBroadcast).text());
  } catch {
    throw new Error("Foundry broadcast record is missing or invalid.");
  }
  if (!broadcast.receipts?.length) throw new Error("Foundry broadcast record contains no transaction receipts.");
  const router = summary.addresses.router.toLowerCase();
  const receipt = broadcast.receipts?.find(
    (item) => typeof item.contractAddress === "string" && item.contractAddress.toLowerCase() === router,
  );
  if (!receipt || typeof receipt.transactionHash !== "string" || !isSuccessfulReceipt(receipt.status)) {
    throw new Error("Foundry broadcast record has no successful Router creation receipt.");
  }
  const routerTransactionHash = receipt.transactionHash;
  const blockNumber = parseQuantity(receipt.blockNumber);
  if (blockNumber === undefined) throw new Error("Router creation receipt is missing its block number.");
  const receipts = broadcast.receipts.map((item): ReceiptEvidence => {
    const transactionHash = item.transactionHash;
    const receiptBlock = parseQuantity(item.blockNumber);
    if (
      typeof transactionHash !== "string" || !/^0x[\da-fA-F]{64}$/.test(transactionHash) ||
      receiptBlock === undefined || !isSuccessfulReceipt(item.status)
    ) throw new Error("Foundry broadcast record contains an invalid or unsuccessful transaction receipt.");
    const evidence: ReceiptEvidence = {
      transactionHash: transactionHash as Hex,
      blockNumber: Number(receiptBlock),
      status: "success",
    };
    const gasUsed = parseQuantity(item.gasUsed);
    if (gasUsed !== undefined) evidence.gasUsed = gasUsed.toString();
    if (isAddressValue(item.contractAddress)) evidence.contractAddress = item.contractAddress;
    return evidence;
  });
  if (!receipts.some((item) => item.transactionHash.toLowerCase() === routerTransactionHash.toLowerCase())) {
    throw new Error("The Router creation receipt is missing from successful deployment evidence.");
  }
  return { transactionHash: receipt.transactionHash as Hex, blockNumber, receipts };
}

export async function verifyDeploymentOnChain(
  client: PublicClient,
  summary: DeploymentSummary,
  transactionHash: Hex,
  blockNumber: bigint,
  verificationBlock = blockNumber,
): Promise<bigint> {
  if (verificationBlock < blockNumber) throw new Error("Final setup verification block precedes the Router creation receipt.");
  const [chainId, receipt] = await Promise.all([
    client.getChainId(),
    client.getTransactionReceipt({ hash: transactionHash }),
  ]);
  if (chainId !== ROBINHOOD_CHAIN_ID) throw new Error("RPC chain changed during deployment verification.");
  if (receipt.status !== "success" || receipt.blockNumber !== blockNumber) {
    throw new Error("Router creation receipt does not match the successful Foundry receipt block.");
  }
  if (!receipt.contractAddress || receipt.contractAddress.toLowerCase() !== summary.addresses.router.toLowerCase()) {
    throw new Error("Router deployment receipt does not create the Router address in the summary.");
  }

  await retryPinnedRead(verificationBlock, async () => {
    const hook = summary.addresses.hook;
    const router = summary.addresses.router;
    const bossHP = summary.addresses.bossHP;
    const roy = summary.addresses.roy;
    const mockUSD = summary.addresses.mockUSD;
    const collectibles = summary.addresses.collectibles;
    const manager = summary.addresses.poolManager;
    const code = await Promise.all(Object.values(summary.addresses).map((address) =>
      client.getCode({ address, blockNumber: verificationBlock }),
    ));
    const [
      hookManager, hookRouter, hookMockUSD, hookRoy, hookBossHP, hookCollectibles,
      roundStatus, currentStage, prize, prizeFunded, poolInitialized, deadline,
      finalEligibleHP, redeemedHP, paidPrize, stageSold0, stageSold1, stageSold2,
      lowerTick, upperTick, bossIsCurrency0, sqrtLower, sqrtUpper, initialBossPrice,
      routerManager, routerMockUSD, routerRoy, routerBossHP, routerHook, routerActivated,
      minimumBossHP, bossHPSupply, hpInHook, hpInRouter, hpInManager,
      roySupply, royInHook, royInRouter, royInManager, royInDeployer,
      mockUSDBalance, collectibleMinter,
    ] = await Promise.all([
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "manager", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "router", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "mockUSD", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "roy", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "bossHP", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "collectibles", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "status", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "currentStage", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "originalPrize", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "prizeFunded", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "poolInitialized", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "deadline", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "finalEligibleHP", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "redeemedHP", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "paidPrize", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageSold", args: [0], blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageSold", args: [1], blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageSold", args: [2], blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "LOWER_TICK", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "UPPER_TICK", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "bossIsCurrency0", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "sqrtLowerX96", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "sqrtUpperX96", blockNumber: verificationBlock }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "lastSqrtPriceX96", blockNumber: verificationBlock }),
      client.readContract({ address: router, abi: bossRouterAbi, functionName: "manager", blockNumber: verificationBlock }),
      client.readContract({ address: router, abi: bossRouterAbi, functionName: "mockUSD", blockNumber: verificationBlock }),
      client.readContract({ address: router, abi: bossRouterAbi, functionName: "roy", blockNumber: verificationBlock }),
      client.readContract({ address: router, abi: bossRouterAbi, functionName: "bossHP", blockNumber: verificationBlock }),
      client.readContract({ address: router, abi: bossRouterAbi, functionName: "bossHook", blockNumber: verificationBlock }),
      client.readContract({ address: router, abi: bossRouterAbi, functionName: "activated", blockNumber: verificationBlock }),
      client.readContract({ address: router, abi: bossRouterAbi, functionName: "minimumBossHPForVictoryPath", blockNumber: verificationBlock }),
      client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "totalSupply", blockNumber: verificationBlock }),
      client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [hook], blockNumber: verificationBlock }),
      client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [router], blockNumber: verificationBlock }),
      client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [manager], blockNumber: verificationBlock }),
      client.readContract({ address: roy, abi: royTokenAbi, functionName: "totalSupply", blockNumber: verificationBlock }),
      client.readContract({ address: roy, abi: royTokenAbi, functionName: "balanceOf", args: [hook], blockNumber: verificationBlock }),
      client.readContract({ address: roy, abi: royTokenAbi, functionName: "balanceOf", args: [router], blockNumber: verificationBlock }),
      client.readContract({ address: roy, abi: royTokenAbi, functionName: "balanceOf", args: [manager], blockNumber: verificationBlock }),
      client.readContract({ address: roy, abi: royTokenAbi, functionName: "balanceOf", args: [summary.deployer], blockNumber: verificationBlock }),
      client.readContract({ address: mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [hook], blockNumber: verificationBlock }),
      client.readContract({ address: collectibles, abi: bossCollectiblesAbi, functionName: "minter", blockNumber: verificationBlock }),
    ]);
    const verificationTimestamp = await client.getBlock({ blockNumber: verificationBlock });
    if (code.some((bytecode) => !bytecode || bytecode === "0x")) {
      throw new Error("A test deployment address has no on-chain contract code at the final setup block.");
    }
    const sameAddress = (left: Address, right: Address) => left.toLowerCase() === right.toLowerCase();
    if (
      !sameAddress(hookManager, manager) || !sameAddress(hookRouter, router) ||
      !sameAddress(hookMockUSD, mockUSD) || !sameAddress(hookRoy, roy) ||
      !sameAddress(hookBossHP, bossHP) || !sameAddress(hookCollectibles, collectibles) ||
      !sameAddress(routerManager, manager) || !sameAddress(routerMockUSD, mockUSD) ||
      !sameAddress(routerRoy, roy) || !sameAddress(routerBossHP, bossHP) ||
      !sameAddress(routerHook, hook) || !sameAddress(collectibleMinter, hook) ||
      !routerActivated || roundStatus !== 1 || currentStage !== 0 ||
      prize !== 1_000_000_000n || !prizeFunded || !poolInitialized ||
      deadline <= BigInt(verificationTimestamp.timestamp) || mockUSDBalance < prize ||
      finalEligibleHP !== 0n || redeemedHP !== 0n || paidPrize !== 0n ||
      stageSold0 !== 0n || stageSold1 !== 0n || stageSold2 !== 0n ||
      lowerTick !== (bossIsCurrency0 ? 0 : -1_920) ||
      upperTick !== (bossIsCurrency0 ? 1_920 : 0) ||
      initialBossPrice !== (bossIsCurrency0 ? sqrtLower : sqrtUpper) ||
      bossHPSupply !== 2_000n * 10n ** 18n ||
      hpInHook + hpInRouter + hpInManager !== bossHPSupply ||
      minimumBossHP > bossHPSupply || roySupply !== 100_000n * 10n ** 18n ||
      royInHook + royInRouter + royInManager + royInDeployer !== roySupply ||
      royInRouter < 10_000n * 10n ** 18n
    ) throw new Error("Live deployment state, contract identities, or locked-token custody failed verification.");
  });
  return verificationBlock;
}

async function retryPinnedRead<T>(blockNumber: bigint, read: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await read();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Robinhood RPC did not expose final deployment state at block ${blockNumber} after bounded retries.`, { cause: lastError });
}

export function parseForgeGas(output: string): { gas: bigint; requiredWei: bigint } {
  const gas = output.match(/Estimated total gas used for script:\s*([\d,]+)/)?.[1]?.replaceAll(",", "");
  const requiredEth = output.match(/Estimated amount required:\s*([\d.]+)\s*ETH/)?.[1];
  if (!gas || !requiredEth) throw new Error("Forge dry-run did not report deployment gas and funding.");
  return { gas: BigInt(gas), requiredWei: parseEtherDecimal(requiredEth) };
}

export function parseEtherDecimal(value: string): bigint {
  const [whole, fractional = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt((fractional + "0".repeat(18)).slice(0, 18));
}

export function parseQuantity(value: unknown): bigint | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^0x[\da-fA-F]+$/.test(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
}

export function assertCommittedDeploymentSources(): string {
  const guardedPaths = [
    "contracts/src",
    "contracts/test",
    "contracts/script/DeployBossPool.s.sol",
    "contracts/foundry.toml",
    "contracts/lib/v4-core",
    ".gitmodules",
    "scripts/testnet-common.ts",
    "scripts/testnet-deploy.ts",
  ];
  let changes: string;
  try {
    changes = execFileSync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all", "--", ...guardedPaths],
      { cwd: process.cwd(), encoding: "utf8" },
    ).trim();
  } catch {
    throw new Error("Could not verify frozen contract/deployment source before testnet broadcast.");
  }
  if (changes) {
    throw new Error("Commit and freeze the contract, deployment script, Foundry config, and runner before testnet broadcast.");
  }

  const v4CorePath = path.join(CONTRACTS_DIR, "lib/v4-core");
  try {
    const expectedEntry = execFileSync("git", ["ls-tree", "HEAD", "contracts/lib/v4-core"], {
      cwd: process.cwd(), encoding: "utf8",
    }).trim();
    const expected = expectedEntry.match(/^160000 commit ([\da-f]{40})\s/iu)?.[1];
    const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: v4CorePath, encoding: "utf8" }).trim();
    const dependencyStatus = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
      cwd: v4CorePath, encoding: "utf8",
    }).trim();
    const nestedStatus = execFileSync("git", ["submodule", "status", "--recursive"], {
      cwd: v4CorePath, encoding: "utf8",
    }).trimEnd();
    if (
      !expected || expected !== actual || dependencyStatus ||
      nestedStatus.split(/\r?\n/).filter(Boolean).some((line) => line[0] !== " ")
    ) throw new Error("pinned dependency changed");
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    throw new Error("Pinned deployment dependencies are missing, dirty, or differ from the committed submodule revisions.");
  }
}

export function isSuccessfulReceipt(status: unknown): boolean {
  return status === 1 || status === "1" || status === "0x1" || status === "success";
}

export function sanitizeSecrets(message: string, config?: Pick<TestnetConfig, "rpcUrl" | "deployerKey" | "playerBKey">): string {
  const additionalSecrets = config ? [config.rpcUrl, config.deployerKey, config.playerBKey] : [];
  return redactSensitive(message, additionalSecrets);
}

export function redactSensitive(message: string, additionalSecrets: string[] = []): string {
  let sanitized = message;
  const secrets = [
    ...additionalSecrets,
    process.env.ROBINHOOD_RPC_URL ?? "",
    process.env.TESTNET_DEPLOYER_PRIVATE_KEY ?? "",
    process.env.TESTNET_PLAYER_PRIVATE_KEY ?? "",
  ].filter(Boolean);
  for (const secret of secrets) {
    const replacements = new Set([secret, secret.toLowerCase(), secret.toUpperCase()]);
    if (/^0x[\da-fA-F]{64}$/.test(secret)) {
      const bareKey = secret.slice(2);
      replacements.add(bareKey);
      replacements.add(bareKey.toLowerCase());
      replacements.add(bareKey.toUpperCase());
      replacements.add(BigInt(secret).toString());
    }
    for (const form of replacements) sanitized = sanitized.replaceAll(form, "[sensitive value redacted]");
  }
  return sanitized.replace(/https?:\/\/[^\s"'<>]+/g, "[RPC URL redacted]");
}
