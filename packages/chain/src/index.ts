import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  type Address,
  type PublicClient,
} from "viem";
import {
  bossHpAbi,
  bossPoolHookAbi,
  mockUsdAbi,
} from "./generated/abi";

export {
  bossFactoryAbi,
  bossCollectiblesAbi,
  bossHpAbi,
  bossPoolHookAbi,
  bossRouterAbi,
  mockUsdAbi,
  royTokenAbi,
} from "./generated/abi";
export { formatUnits, isAddress } from "viem";
export type { Address } from "viem";

export const LOCAL_CHAIN_ID = 31337;
export const DEFAULT_LOCAL_RPC_URL = "http://127.0.0.1:8547";

export type LocalDeploymentManifest = {
  schemaVersion: 1;
  chainId: 31337;
  rpcUrl: string;
  deployedAtBlock: number;
  deploymentTxHash: `0x${string}`;
  addresses: {
    hook: Address;
    router: Address;
    bossHP: Address;
    roy: Address;
    mockUSD: Address;
    collectibles: Address;
    poolManager: Address;
  };
};

export type LocalRoundSnapshot = {
  blockNumber: bigint;
  status: number;
  currentStage: number;
  stageSold: readonly [bigint, bigint, bigint];
  stageCapacity: readonly [bigint, bigint, bigint];
  stageEndSqrtPriceX96: readonly [bigint, bigint, bigint];
  bossHPCurrency0: boolean;
  bossTickLower: number;
  bossTickUpper: number;
  bossSqrtLowerX96: bigint;
  bossSqrtUpperX96: bigint;
  bossInitialSqrtPriceX96: bigint;
  originalPrize: bigint;
  mockUSDInHook: bigint;
  finalEligibleHP: bigint;
  redeemedHP: bigint;
  paidPrize: bigint;
  bossHPTotalSupply: bigint;
  bossHPInHook: bigint;
  bossHPInRouter: bigint;
  bossHPInPoolManager: bigint;
  walletBossHP?: bigint;
};

export async function fetchLocalDeployment(): Promise<LocalDeploymentManifest> {
  const response = await fetch("/deployments/local.json", { cache: "no-store" });
  if (response.status === 404) throw new Error("LOCAL_DEPLOYMENT_MISSING");
  if (!response.ok) throw new Error(`Local deployment request failed (${response.status}).`);
  if (!response.headers.get("content-type")?.toLowerCase().includes("json")) {
    throw new Error("LOCAL_DEPLOYMENT_MISSING");
  }
  try {
    return parseLocalDeployment(await response.json());
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Local deployment manifest is malformed.");
    throw error;
  }
}

export function parseLocalDeployment(value: unknown): LocalDeploymentManifest {
  if (!value || typeof value !== "object") throw new Error("Local deployment manifest is invalid.");
  const manifest = value as Partial<LocalDeploymentManifest>;
  const addresses = manifest.addresses;
  const addressNames = ["hook", "router", "bossHP", "roy", "mockUSD", "collectibles", "poolManager"] as const;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.chainId !== 31337 ||
    !isLocalRpcUrl(manifest.rpcUrl) ||
    typeof manifest.deployedAtBlock !== "number" || !Number.isSafeInteger(manifest.deployedAtBlock) || manifest.deployedAtBlock < 0 ||
    typeof manifest.deploymentTxHash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(manifest.deploymentTxHash) ||
    !addresses || addressNames.some((name) => !isAddress(addresses[name]))
  ) throw new Error("Local deployment manifest is invalid or not a local-chain deployment.");
  return manifest as LocalDeploymentManifest;
}

export function isLocalRpcUrl(rpcUrl: unknown): rpcUrl is string {
  if (typeof rpcUrl !== "string") return false;
  try {
    const url = new URL(rpcUrl);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function createLocalPublicClient(source: LocalDeploymentManifest | string = DEFAULT_LOCAL_RPC_URL): PublicClient {
  const rpcUrl = typeof source === "string" ? source : source.rpcUrl;
  if (!isLocalRpcUrl(rpcUrl)) throw new Error("RPC URL must point to localhost for the local chain.");
  const chain = defineChain({
    id: LOCAL_CHAIN_ID,
    name: "Boss Pool Local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

export async function verifyLocalDeployment(
  manifest: LocalDeploymentManifest,
  client = createLocalPublicClient(manifest),
): Promise<void> {
  const [chainId, receipt, ...code] = await Promise.all([
    client.getChainId(),
    client.getTransactionReceipt({ hash: manifest.deploymentTxHash }),
    ...Object.values(manifest.addresses).map((address) => client.getCode({ address })),
  ]);
  if (chainId !== manifest.chainId) throw new Error(`Local RPC is chain ${chainId}; expected ${manifest.chainId}.`);
  if (receipt.status !== "success" || Number(receipt.blockNumber) !== manifest.deployedAtBlock) {
    throw new Error("The recorded local deployment transaction is missing or does not match its block.");
  }
  if (code.some((bytecode) => !bytecode || bytecode === "0x")) {
    throw new Error("The local deployment manifest points to an address with no contract code.");
  }
}

export async function readLocalRound(
  manifest: LocalDeploymentManifest,
  player?: Address,
): Promise<LocalRoundSnapshot> {
  const client = createLocalPublicClient(manifest);
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  const hook = manifest.addresses.hook;
  const bossHP = manifest.addresses.bossHP;
  const [
    status,
    currentStage,
    sold0,
    sold1,
    sold2,
    capacity0,
    capacity1,
    capacity2,
    endPrice0,
    endPrice1,
    endPrice2,
    bossHPCurrency0,
    bossTickLower,
    bossTickUpper,
    bossSqrtLowerX96,
    bossSqrtUpperX96,
    bossInitialSqrtPriceX96,
    originalPrize,
    mockUSDInHook,
    finalEligibleHP,
    redeemedHP,
    paidPrize,
    bossHPTotalSupply,
    bossHPInHook,
    bossHPInRouter,
    bossHPInPoolManager,
  ] = await Promise.all([
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "status", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "currentStage", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageSold", args: [0], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageSold", args: [1], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageSold", args: [2], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageCapacity", args: [0], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageCapacity", args: [1], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageCapacity", args: [2], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageEndSqrtPriceX96", args: [0], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageEndSqrtPriceX96", args: [1], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageEndSqrtPriceX96", args: [2], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "bossIsCurrency0", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "LOWER_TICK", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "UPPER_TICK", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "sqrtLowerX96", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "sqrtUpperX96", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "lastSqrtPriceX96", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "originalPrize", blockNumber }),
    client.readContract({ address: manifest.addresses.mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [hook], blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "finalEligibleHP", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "redeemedHP", blockNumber }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "paidPrize", blockNumber }),
    client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "totalSupply", blockNumber }),
    client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [hook], blockNumber }),
    client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [manifest.addresses.router], blockNumber }),
    client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [manifest.addresses.poolManager], blockNumber }),
  ]);
  const walletBossHP = player
    ? await client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [player], blockNumber })
    : undefined;

  return {
    blockNumber,
    status,
    currentStage,
    stageSold: [sold0, sold1, sold2],
    stageCapacity: [capacity0, capacity1, capacity2],
    stageEndSqrtPriceX96: [endPrice0, endPrice1, endPrice2],
    bossHPCurrency0,
    bossTickLower,
    bossTickUpper,
    bossSqrtLowerX96,
    bossSqrtUpperX96,
    bossInitialSqrtPriceX96,
    originalPrize,
    mockUSDInHook,
    finalEligibleHP,
    redeemedHP,
    paidPrize,
    bossHPTotalSupply,
    bossHPInHook,
    bossHPInRouter,
    bossHPInPoolManager,
    walletBossHP,
  };
}
