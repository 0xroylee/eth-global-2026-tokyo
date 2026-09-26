import {
  createPublicClient,
  decodeEventLog,
  defineChain,
  encodeAbiParameters,
  http,
  isAddress,
  keccak256,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
} from "viem";
import { baseSepolia } from "viem/chains";
import {
  bossFactoryAbi,
  bossCollectiblesAbi,
  bossPoolHookAbi,
  bossRouterAbi,
} from "./generated/abi";
import { createBossFactorySdk, readErc20TokenInfo } from "./factory-sdk";

const FACTORY_LOG_PAGE_SIZE = 1_000n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const HOOK_FLAGS = 0x2ac0n;
const HOOK_FLAG_MASK = 0x3fffn;
const POOL_KEY_ABI = [{
  type: "tuple",
  components: [
    { name: "currency0", type: "address" },
    { name: "currency1", type: "address" },
    { name: "fee", type: "uint24" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
  ],
}] as const;
const BOSS_LAUNCHED_EVENT = bossFactoryAbi.find((item) => item.type === "event" && item.name === "BossLaunched")!;

export const LOCAL_CHAIN_ID = 31337;
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const DEFAULT_LOCAL_RPC_URL = "http://127.0.0.1:8547";
export const DEFAULT_ROBINHOOD_RPC_URL = "https://rpc.testnet.chain.robinhood.com/rpc";
export const DEFAULT_BASE_SEPOLIA_RPC_URL = "https://sepolia.base.org";

export type SupportedChainId = typeof LOCAL_CHAIN_ID | typeof ROBINHOOD_TESTNET_CHAIN_ID | typeof BASE_SEPOLIA_CHAIN_ID;
export type DeploymentAddresses = {
  hook: Address;
  router: Address;
  bossHP: Address;
  roy: Address;
  mockUSD: Address;
  collectibles: Address;
  poolManager: Address;
};
export type EncounterMode = "standalone" | "factory";
export type TokenMetadata = { readonly address: Address; readonly symbol: string; readonly decimals: number };
export type FactoryBossOrigin = {
  readonly kind: "factory";
  readonly factoryAddress: Address;
  readonly factoryDeployedAtBlock: number;
  readonly bossId: Hex;
  readonly launchTxHash: Hex;
  readonly launchLogIndex: number;
  readonly launchBlockNumber: number;
};
export type DeploymentProvenance =
  | { readonly kind: "standalone"; readonly deploymentTxHash: Hex; readonly deployedAtBlock: number }
  | FactoryBossOrigin;
type ManifestBase = {
  schemaVersion: 1;
  deployedAtBlock: number;
  deploymentTxHash: `0x${string}`;
  deployer?: Address;
  bossFactory?: Address;
  bossFactoryDeployedAtBlock?: number;
  /** Factory launch proof retained with a resolved encounter so recovery can re-verify its original origin. */
  bossOrigin?: FactoryBossOrigin;
  addresses: DeploymentAddresses;
  [key: string]: unknown;
};
export type LocalDeploymentManifest = ManifestBase & {
  chainId: typeof LOCAL_CHAIN_ID;
  rpcUrl: string;
  network?: "local";
};
export type RobinhoodDeploymentManifest = ManifestBase & {
  chainId: typeof ROBINHOOD_TESTNET_CHAIN_ID;
  network: "robinhood-testnet";
  rpcUrl?: never;
};
export type BaseSepoliaDeploymentManifest = ManifestBase & {
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  network: "base-sepolia";
  rpcUrl?: never;
};
export type TestnetDeploymentManifest = RobinhoodDeploymentManifest | BaseSepoliaDeploymentManifest;
export type DeploymentManifest = LocalDeploymentManifest | TestnetDeploymentManifest;
export type VerifiedDeployment = {
  readonly manifest: DeploymentManifest;
  readonly chainId: SupportedChainId;
  readonly chain: Chain;
  readonly verifiedAtBlock: bigint;
  readonly verifiedAtTimestamp: bigint;
  /** Optional in the public shape for legacy serialized fixtures; every runtime verifier returns it. */
  readonly hookAddress?: Address;
  readonly encounterMode?: EncounterMode;
  readonly provenance?: DeploymentProvenance;
  readonly hpToken?: TokenMetadata;
  readonly rewardToken?: TokenMetadata;
};

export class DeploymentResolutionError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DeploymentResolutionError";
    this.code = code;
  }
}

const verifiedDeployments = new WeakSet<object>();
const verificationClients = new WeakMap<object, PublicClient>();

export function parseDeployment(value: unknown): DeploymentManifest {
  if (!value || typeof value !== "object") throw new Error("Deployment manifest is invalid.");
  const manifest = value as Record<string, unknown>;
  const addresses = manifest.addresses as Record<string, unknown> | undefined;
  const names = ["hook", "router", "bossHP", "roy", "mockUSD", "collectibles", "poolManager"] as const;
  if (
    manifest.schemaVersion !== 1 ||
    typeof manifest.deployedAtBlock !== "number" || !Number.isSafeInteger(manifest.deployedAtBlock) || manifest.deployedAtBlock < 0 ||
    typeof manifest.deploymentTxHash !== "string" || !/^0x[\da-fA-F]{64}$/.test(manifest.deploymentTxHash) ||
    !addresses || names.some((name) => !isAddressValue(addresses[name]))
  ) throw new Error("Deployment manifest is missing a valid chain receipt or contract address.");
  if (manifest.bossFactory !== undefined && !isAddressValue(manifest.bossFactory)) {
    throw new Error("Deployment manifest has an invalid Boss Factory address.");
  }
  if (manifest.bossFactoryDeployedAtBlock !== undefined &&
      (!isNonnegativeSafeInteger(manifest.bossFactoryDeployedAtBlock) || manifest.bossFactory === undefined)) {
    throw new Error("Deployment manifest has an invalid Boss Factory deployment baseline.");
  }
  if (manifest.bossOrigin !== undefined) {
    if (!manifest.bossOrigin || typeof manifest.bossOrigin !== "object") {
      throw new Error("Deployment manifest has an invalid Factory launch origin.");
    }
    const origin = manifest.bossOrigin as Record<string, unknown>;
    if (
      origin.kind !== "factory" || !isAddressValue(origin.factoryAddress) || !isHashValue(origin.bossId) ||
      !isHashValue(origin.launchTxHash) || !isNonnegativeSafeInteger(origin.factoryDeployedAtBlock) ||
      !isNonnegativeSafeInteger(origin.launchBlockNumber) || !isNonnegativeSafeInteger(origin.launchLogIndex) ||
      manifest.bossFactory === undefined ||
      origin.factoryAddress.toLowerCase() !== String(manifest.bossFactory).toLowerCase() ||
      manifest.bossFactoryDeployedAtBlock !== origin.factoryDeployedAtBlock ||
      manifest.deploymentTxHash !== origin.launchTxHash || manifest.deployedAtBlock !== origin.launchBlockNumber
    ) throw new Error("Deployment manifest has an invalid Factory launch origin.");
  }

  const checkedAddresses = addresses as unknown as DeploymentAddresses;
  if (manifest.chainId === LOCAL_CHAIN_ID) {
    if (manifest.network !== undefined && manifest.network !== "local") {
      throw new Error("Local deployment manifest has an unexpected network label.");
    }
    if (!isLocalRpcUrl(manifest.rpcUrl)) throw new Error("Local deployment RPC must use a credential-free loopback URL.");
    return value as LocalDeploymentManifest;
  }
  if (manifest.chainId === ROBINHOOD_TESTNET_CHAIN_ID) {
    if (manifest.network !== "robinhood-testnet" || manifest.rpcUrl !== undefined) {
      throw new Error("Robinhood deployment manifests require the testnet label and must omit the RPC URL.");
    }
    return value as RobinhoodDeploymentManifest;
  }
  if (manifest.chainId === BASE_SEPOLIA_CHAIN_ID) {
    if (manifest.network !== "base-sepolia" || manifest.rpcUrl !== undefined) {
      throw new Error("Base Sepolia deployment manifests require the base-sepolia label and must omit the RPC URL.");
    }
    return value as BaseSepoliaDeploymentManifest;
  }
  void checkedAddresses;
  throw new Error("Unsupported Boss Pool chain. Expected local 31337, Base Sepolia 84532, or historical Robinhood testnet 46630.");
}

export function parseLocalDeployment(value: unknown): LocalDeploymentManifest {
  const manifest = parseDeployment(value);
  if (manifest.chainId !== LOCAL_CHAIN_ID) throw new Error("Deployment manifest is not for the local chain.");
  return manifest;
}

export function parseBaseSepoliaDeployment(value: unknown): BaseSepoliaDeploymentManifest {
  const manifest = parseDeployment(value);
  if (manifest.chainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error("Deployment manifest is not for Base Sepolia.");
  return manifest;
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

export function createPublicClientForNetwork(chainId: SupportedChainId, rpcUrl: string): PublicClient {
  const network = networkName(chainId);
  if (chainId === LOCAL_CHAIN_ID && !isLocalRpcUrl(rpcUrl)) {
    throw new Error("Local RPC URL must be a credential-free loopback HTTP URL.");
  }
  if (chainId !== LOCAL_CHAIN_ID) {
    let url: URL;
    try {
      url = new URL(rpcUrl);
    } catch {
      throw new Error(`${network} RPC URL must be a valid HTTPS endpoint.`);
    }
    if (url.protocol !== "https:" || !url.hostname) throw new Error(`${network} RPC URL must use HTTPS.`);
  }
  const isBaseSepolia = chainId === BASE_SEPOLIA_CHAIN_ID;
  const chain = defineChain({
    id: chainId,
    name: network,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    ...(isBaseSepolia ? { contracts: baseSepolia.contracts } : {}),
  });
  return createPublicClient({
    chain,
    ...(isBaseSepolia ? { batch: { multicall: true } } : {}),
    transport: http(rpcUrl, { batch: isBaseSepolia }),
  });
}

export function createLocalPublicClient(source: LocalDeploymentManifest | string = DEFAULT_LOCAL_RPC_URL): PublicClient {
  const rpcUrl = typeof source === "string" ? source : source.rpcUrl;
  return createPublicClientForNetwork(LOCAL_CHAIN_ID, rpcUrl);
}

export function createRobinhoodPublicClient(rpcUrl = DEFAULT_ROBINHOOD_RPC_URL): PublicClient {
  return createPublicClientForNetwork(ROBINHOOD_TESTNET_CHAIN_ID, rpcUrl);
}

export function createBaseSepoliaPublicClient(rpcUrl = DEFAULT_BASE_SEPOLIA_RPC_URL): PublicClient {
  return createPublicClientForNetwork(BASE_SEPOLIA_CHAIN_ID, rpcUrl);
}

export async function fetchLocalDeployment(): Promise<LocalDeploymentManifest> {
  return fetchDeployment("/deployments/local.json", parseLocalDeployment);
}

export async function fetchRobinhoodDeployment(): Promise<RobinhoodDeploymentManifest> {
  const deployment = await fetchDeployment("/deployments/robinhood-testnet.json", parseDeployment);
  if (deployment.chainId !== ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error("Deployment manifest is not for Robinhood testnet.");
  }
  return deployment;
}

export async function fetchBaseSepoliaDeployment(): Promise<BaseSepoliaDeploymentManifest> {
  const deployment = await fetchDeployment("/deployments/base-sepolia.json", parseBaseSepoliaDeployment);
  if (deployment.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error("Deployment manifest is not for Base Sepolia.");
  }
  return deployment;
}

async function fetchDeployment<T>(url: string, parse: (value: unknown) => T): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error(`Deployment request failed for ${url}.`);
  }
  if (response.status === 404 || !response.headers.get("content-type")?.toLowerCase().includes("json")) {
    throw new Error(url.includes("local.json") ? "LOCAL_DEPLOYMENT_MISSING" : "TESTNET_DEPLOYMENT_MISSING");
  }
  if (!response.ok) throw new Error(`Deployment request failed (${response.status}).`);
  try {
    return parse(await response.json());
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Deployment manifest JSON is malformed.");
    throw error;
  }
}

export async function verifyDeployment(
  client: PublicClient,
  input: DeploymentManifest | unknown,
): Promise<VerifiedDeployment> {
  const manifest = immutableSnapshot(parseDeployment(input));
  if (manifest.bossOrigin) return verifyFactoryOrigin(client, manifest, manifest.bossOrigin);
  const [chainId, latestBlock, receipt] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber({ cacheTime: 0 }),
    client.getTransactionReceipt({ hash: manifest.deploymentTxHash }),
  ]);
  if (chainId !== manifest.chainId) {
    throw new Error(`RPC chain is ${chainId}; expected ${manifest.chainId}.`);
  }
  if (client.chain && client.chain.id !== manifest.chainId) {
    throw new Error(`Public client chain is ${client.chain.id}; expected ${manifest.chainId}.`);
  }
  if (receipt.status !== "success" || receipt.blockNumber !== BigInt(manifest.deployedAtBlock)) {
    throw new Error("Recorded deployment transaction is missing or does not match its block.");
  }
  if (!receipt.contractAddress || receipt.contractAddress.toLowerCase() !== manifest.addresses.router.toLowerCase()) {
    throw new Error("Recorded deployment transaction did not create the configured Router.");
  }

  const block = await client.getBlock({ blockNumber: latestBlock });
  const { hook, router, bossHP, roy, mockUSD, collectibles, poolManager } = manifest.addresses;
  const codeAddresses = [...Object.values(manifest.addresses), ...(manifest.bossFactory ? [manifest.bossFactory] : [])];
  const [
    hookManager, hookRouter, hookBossHP, hookRoy, hookMockUSD, hookCollectibles,
    routerManager, routerBossHP, routerRoy, routerMockUSD, routerHook, collectibleMinter,
    ...code
  ] = await Promise.all([
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "manager", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "router", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "bossHP", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "roy", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "mockUSD", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "collectibles", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "manager", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "bossHP", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "roy", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "mockUSD", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "bossHook", blockNumber: latestBlock }),
    client.readContract({ address: collectibles, abi: bossCollectiblesAbi, functionName: "minter", blockNumber: latestBlock }),
    ...codeAddresses.map((address) => client.getCode({ address, blockNumber: latestBlock })),
  ]);
  const expected = [managerAddress(manifest), router, bossHP, roy, mockUSD, collectibles, managerAddress(manifest), bossHP, roy, mockUSD, hook, hook];
  const actual = [hookManager, hookRouter, hookBossHP, hookRoy, hookMockUSD, hookCollectibles,
    routerManager, routerBossHP, routerRoy, routerMockUSD, routerHook, collectibleMinter];
  if (
    actual.some((address, index) => address.toLowerCase() !== expected[index].toLowerCase()) ||
    code.some((bytecode) => !bytecode || bytecode === "0x")
  ) throw new Error("Deployment code or immutable contract wiring failed verification.");
  if (manifest.bossFactory) {
    const [factoryManager, factoryMockUSD, factoryAttackToken] = await Promise.all([
      client.readContract({ address: manifest.bossFactory, abi: bossFactoryAbi, functionName: "manager", blockNumber: latestBlock }),
      client.readContract({ address: manifest.bossFactory, abi: bossFactoryAbi, functionName: "mockUSD", blockNumber: latestBlock }),
      client.readContract({ address: manifest.bossFactory, abi: bossFactoryAbi, functionName: "attackToken", blockNumber: latestBlock }),
    ]);
    if (
      factoryManager.toLowerCase() !== poolManager.toLowerCase() ||
      factoryMockUSD.toLowerCase() !== mockUSD.toLowerCase() ||
      factoryAttackToken.toLowerCase() !== roy.toLowerCase()
    ) throw new Error("Boss Factory wiring does not match the verified Base deployment.");
  }

  const [hpInfo, rewardInfo] = await Promise.all([
    readErc20TokenInfo(client, bossHP),
    readErc20TokenInfo(client, mockUSD),
  ]);

  const chain = client.chain ?? defineChain({
    id: manifest.chainId,
    name: networkName(manifest.chainId),
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
  const verified: VerifiedDeployment = Object.freeze({
    manifest,
    chainId: manifest.chainId,
    chain,
    verifiedAtBlock: latestBlock,
    verifiedAtTimestamp: block.timestamp,
    hookAddress: hook,
    encounterMode: "standalone",
    provenance: Object.freeze({
      kind: "standalone" as const,
      deploymentTxHash: manifest.deploymentTxHash,
      deployedAtBlock: manifest.deployedAtBlock,
    } satisfies DeploymentProvenance),
    hpToken: tokenMetadata(hpInfo),
    rewardToken: tokenMetadata(rewardInfo),
  });
  verifiedDeployments.add(verified);
  verificationClients.set(verified, client);
  return verified;
}

type BossLaunchedArgs = {
  bossId: Hex;
  maker: Address;
  token: Address;
  hook: Address;
  router: Address;
  collectibles: Address;
  tokenAllocation: bigint;
  prizeAmount: bigint;
  volumeTargetMockUSD: bigint;
  hpPriceTick: number;
};
type FactoryLaunchRecord = {
  args: BossLaunchedArgs;
  origin: FactoryBossOrigin;
};
type FactoryLaunchLog = {
  address: Address;
  data: Hex;
  topics: [signature: Hex, ...args: Hex[]];
  logIndex: number | null;
  blockNumber: bigint | null;
  transactionHash: Hex | null;
};
type FactoryDiscoveryCache = {
  scannedThroughBlock: bigint;
  launchesByHook: Map<string, FactoryLaunchRecord>;
};

const resolvedDeploymentCache = new WeakMap<PublicClient, Map<string, Promise<VerifiedDeployment>>>();
const factoryDiscoveryCaches = new WeakMap<PublicClient, Map<string, FactoryDiscoveryCache>>();

export async function resolveBossDeployment(
  client: PublicClient,
  baseManifest: DeploymentManifest | unknown,
  hookAddress: string,
): Promise<VerifiedDeployment> {
  if (!isAddress(hookAddress, { strict: false })) {
    throw new DeploymentResolutionError("INVALID_HOOK_ADDRESS", "Boss Hook address is invalid.");
  }
  const input = parseDeployment(baseManifest);
  const normalizedHook = hookAddress as Address;
  const key = `${manifestIdentity(input)}:${normalizedHook.toLowerCase()}`;
  let cache = resolvedDeploymentCache.get(client);
  if (!cache) {
    cache = new Map();
    resolvedDeploymentCache.set(client, cache);
  }
  const existing = cache.get(key);
  if (existing) return existing;

  const pending = (async () => {
    const trustedBase = await verifyDeployment(client, input);
    if (sameAddress(normalizedHook, trustedBase.hookAddress!)) return trustedBase;
    return resolveFactoryBoss(client, trustedBase.manifest, normalizedHook);
  })();
  cache.set(key, pending);
  try {
    return await pending;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

async function resolveFactoryBoss(
  client: PublicClient,
  baseManifest: DeploymentManifest,
  hook: Address,
): Promise<VerifiedDeployment> {
  const factory = baseManifest.bossFactory;
  const factoryDeployedAtBlock = baseManifest.bossFactoryDeployedAtBlock;
  if (!factory) throw new DeploymentResolutionError("FACTORY_NOT_CONFIGURED", "No Boss Factory is configured for this network.");
  if (factoryDeployedAtBlock === undefined) {
    throw new DeploymentResolutionError("FACTORY_BASELINE_MISSING", "Boss Factory log discovery needs its recorded deployment block.");
  }
  const chainId = await client.getChainId();
  if (chainId !== baseManifest.chainId || (client.chain && client.chain.id !== baseManifest.chainId)) {
    throw new DeploymentResolutionError("CHAIN_MISMATCH", `RPC chain is ${chainId}; expected ${baseManifest.chainId}.`);
  }
  await assertFactoryBuild(client, factory);
  const head = await client.getBlockNumber({ cacheTime: 0 });
  const launch = await findFactoryLaunch(client, baseManifest, hook, BigInt(head));
  if (!launch) {
    throw new DeploymentResolutionError("BOSS_NOT_FOUND", "No Factory launch for this Hook address was found in the configured deployment history.");
  }
  const encounterManifest = immutableSnapshot(parseDeployment({
    ...baseManifest,
    bossOrigin: launch.origin,
    deploymentTxHash: launch.origin.launchTxHash,
    deployedAtBlock: launch.origin.launchBlockNumber,
    addresses: {
      ...baseManifest.addresses,
      hook: launch.args.hook,
      router: launch.args.router,
      bossHP: launch.args.token,
      collectibles: launch.args.collectibles,
    },
  }));
  return verifyFactoryOrigin(client, encounterManifest, launch.origin, true);
}

async function verifyFactoryOrigin(
  client: PublicClient,
  manifest: DeploymentManifest,
  origin: FactoryBossOrigin,
  factoryBuildAlreadyChecked = false,
): Promise<VerifiedDeployment> {
  const factory = manifest.bossFactory;
  const factoryBaseline = manifest.bossFactoryDeployedAtBlock;
  if (!factory || factoryBaseline === undefined || !manifest.bossOrigin || !sameOrigin(origin, manifest.bossOrigin)) {
    throw new DeploymentResolutionError("FACTORY_ORIGIN_MISMATCH", "Factory launch provenance is incomplete or does not match the encounter manifest.");
  }
  if (origin.factoryDeployedAtBlock > origin.launchBlockNumber) {
    throw new DeploymentResolutionError("FACTORY_ORIGIN_MISMATCH", "Factory launch predates the configured Factory deployment block.");
  }
  const [chainId, latestBlock, receipt] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber({ cacheTime: 0 }),
    client.getTransactionReceipt({ hash: origin.launchTxHash }),
  ]);
  if (chainId !== manifest.chainId || (client.chain && client.chain.id !== manifest.chainId)) {
    throw new DeploymentResolutionError("CHAIN_MISMATCH", `RPC chain is ${chainId}; expected ${manifest.chainId}.`);
  }
  if (receipt.status !== "success" || receipt.blockNumber !== BigInt(origin.launchBlockNumber)) {
    throw new DeploymentResolutionError("FACTORY_RECEIPT_MISMATCH", "Recorded Factory launch receipt is missing or does not match its block.");
  }
  if (!factoryBuildAlreadyChecked) await assertFactoryBuild(client, factory);

  const event = decodeFactoryLaunchReceipt(receipt, origin, factory);
  assertLaunchMatchesManifest(event.args, manifest, origin);
  const { hook, router, bossHP, roy, mockUSD, collectibles, poolManager } = manifest.addresses;
  const [
    factoryManager,
    factoryMockUSD,
    factoryAttackToken,
    registeredHook,
    hookManager,
    hookRouter,
    hookBossHP,
    hookRoy,
    hookMockUSD,
    hookCollectibles,
    hookRewardToken,
    hookMaker,
    hookExternalHP,
    hookVolumeTarget,
    hookPrize,
    hookSaleBudget,
    hookBossPoolId,
    hookBossPoolKey,
    hookVolumeTargets,
    routerManager,
    routerBossHP,
    routerRoy,
    routerMockUSD,
    routerHook,
    routerBossPoolId,
    routerBossPoolKey,
    routerSupplyPoolId,
    routerSupplyPoolKey,
    collectibleMinter,
    ...code
  ] = await Promise.all([
    client.readContract({ address: factory, abi: bossFactoryAbi, functionName: "manager", blockNumber: latestBlock }),
    client.readContract({ address: factory, abi: bossFactoryAbi, functionName: "mockUSD", blockNumber: latestBlock }),
    client.readContract({ address: factory, abi: bossFactoryAbi, functionName: "attackToken", blockNumber: latestBlock }),
    client.readContract({ address: factory, abi: bossFactoryAbi, functionName: "bosses", args: [origin.bossId], blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "manager", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "router", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "bossHP", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "roy", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "mockUSD", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "collectibles", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "rewardToken", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "maker", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "externalHP", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "volumeTargetMockUSD", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "originalPrize", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "saleHPBudget", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "bossPoolId", blockNumber: latestBlock }),
    client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "bossPoolKey", blockNumber: latestBlock }),
    Promise.all([0, 1, 2].map((stage) => client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageVolumeTarget", args: [stage], blockNumber: latestBlock }))),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "manager", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "bossHP", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "roy", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "mockUSD", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "bossHook", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "bossPoolId", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "bossPoolKey", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "supplyPoolId", blockNumber: latestBlock }),
    client.readContract({ address: router, abi: bossRouterAbi, functionName: "supplyPoolKey", blockNumber: latestBlock }),
    client.readContract({ address: collectibles, abi: bossCollectiblesAbi, functionName: "minter", blockNumber: latestBlock }),
    ...[factory, hook, router, roy, mockUSD, collectibles, poolManager].map((address) => client.getCode({ address, blockNumber: latestBlock })),
  ]);
  const expectedVolumes = expectedStageVolumeTargets(event.args.volumeTargetMockUSD);
  const expectedBossKey = canonicalPoolKey(roy, bossHP, hook);
  const expectedSupplyKey = canonicalPoolKey(mockUSD, roy, ZERO_ADDRESS);
  if (
    !sameAddress(factoryManager, poolManager) || !sameAddress(factoryMockUSD, mockUSD) || !sameAddress(factoryAttackToken, roy) ||
    !sameAddress(registeredHook, hook) ||
    !sameAddress(hookManager, poolManager) || !sameAddress(hookRouter, router) || !sameAddress(hookBossHP, bossHP) ||
    !sameAddress(hookRoy, roy) || !sameAddress(hookMockUSD, mockUSD) || !sameAddress(hookCollectibles, collectibles) ||
    !sameAddress(hookRewardToken, bossHP) || !sameAddress(hookMaker, event.args.maker) || !hookExternalHP ||
    hookVolumeTarget !== event.args.volumeTargetMockUSD || hookPrize !== event.args.prizeAmount ||
    hookSaleBudget <= 0n || hookSaleBudget + hookPrize > event.args.tokenAllocation ||
    !sameAddress(routerManager, poolManager) || !sameAddress(routerBossHP, bossHP) || !sameAddress(routerRoy, roy) ||
    !sameAddress(routerMockUSD, mockUSD) || !sameAddress(routerHook, hook) ||
    !samePoolKey(hookBossPoolKey, expectedBossKey) || !samePoolKey(routerBossPoolKey, expectedBossKey) ||
    !samePoolKey(routerSupplyPoolKey, expectedSupplyKey) ||
    !sameHex(hookBossPoolId, poolKeyId(expectedBossKey)) || !sameHex(routerBossPoolId, poolKeyId(expectedBossKey)) ||
    !sameHex(routerSupplyPoolId, poolKeyId(expectedSupplyKey)) ||
    hookVolumeTargets.some((value, stage) => value !== expectedVolumes[stage]) ||
    !sameAddress(collectibleMinter, hook) || code.some((bytecode) => !bytecode || bytecode === "0x") ||
    !hasHookFlags(hook)
  ) {
    throw new DeploymentResolutionError("FACTORY_WIRING_MISMATCH", "Factory launch code, token wiring, volume mode, or canonical pool key failed verification.");
  }

  const [hpInfo, block] = await Promise.all([
    readErc20TokenInfo(client, bossHP),
    client.getBlock({ blockNumber: latestBlock }),
  ]);
  const chain = client.chain ?? defineChain({
    id: manifest.chainId,
    name: networkName(manifest.chainId),
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [] } },
  });
  const verified: VerifiedDeployment = Object.freeze({
    manifest,
    chainId: manifest.chainId,
    chain,
    verifiedAtBlock: latestBlock,
    verifiedAtTimestamp: block.timestamp,
    hookAddress: hook,
    encounterMode: "factory",
    provenance: origin,
    hpToken: tokenMetadata(hpInfo),
    rewardToken: tokenMetadata(hpInfo),
  });
  verifiedDeployments.add(verified);
  verificationClients.set(verified, client);
  return verified;
}

async function assertFactoryBuild(client: PublicClient, factory: Address): Promise<void> {
  const status = await createBossFactorySdk({ publicClient: client, factory }).checkFactoryBuild();
  if (status.status === "not-deployed") {
    throw new DeploymentResolutionError("FACTORY_NOT_DEPLOYED", "No Boss Factory contract exists at the configured address.");
  }
  if (status.status === "incompatible") {
    throw new DeploymentResolutionError("FACTORY_BUILD_MISMATCH", "This Boss Factory does not match the supported Hook and Router build.");
  }
}

async function findFactoryLaunch(
  client: PublicClient,
  manifest: DeploymentManifest,
  hook: Address,
  head: bigint,
): Promise<FactoryLaunchRecord | undefined> {
  const factory = manifest.bossFactory!;
  const start = BigInt(manifest.bossFactoryDeployedAtBlock!);
  if (start > head) throw new DeploymentResolutionError("FACTORY_BASELINE_INVALID", "Boss Factory deployment block is later than the current chain head.");
  const key = `${manifest.chainId}:${factory.toLowerCase()}:${start}`;
  let cacheByFactory = factoryDiscoveryCaches.get(client);
  if (!cacheByFactory) {
    cacheByFactory = new Map();
    factoryDiscoveryCaches.set(client, cacheByFactory);
  }
  let cache = cacheByFactory.get(key);
  if (!cache) {
    cache = { scannedThroughBlock: start - 1n, launchesByHook: new Map() };
    cacheByFactory.set(key, cache);
  }
  while (cache.scannedThroughBlock < head) {
    const fromBlock = cache.scannedThroughBlock + 1n;
    const toBlock = fromBlock + FACTORY_LOG_PAGE_SIZE - 1n < head ? fromBlock + FACTORY_LOG_PAGE_SIZE - 1n : head;
    const logs = await getFactoryLaunchLogs(client, factory, fromBlock, toBlock);
    for (const log of logs) {
      const event = decodeFactoryLaunchLog(log);
      if (!event) continue;
      if (log.logIndex === null || log.blockNumber === null || log.transactionHash === null ||
          log.blockNumber > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new DeploymentResolutionError("FACTORY_LAUNCH_LOG_INCOMPLETE", "Factory launch log is missing its block, transaction, or log identity.");
      }
      const origin: FactoryBossOrigin = {
        kind: "factory",
        factoryAddress: factory,
        factoryDeployedAtBlock: manifest.bossFactoryDeployedAtBlock!,
        bossId: event.bossId,
        launchTxHash: log.transactionHash,
        launchLogIndex: log.logIndex,
        launchBlockNumber: Number(log.blockNumber),
      };
      const addressKey = event.hook.toLowerCase();
      const previous = cache.launchesByHook.get(addressKey);
      if (previous && !sameOrigin(previous.origin, origin)) {
        throw new DeploymentResolutionError("FACTORY_LAUNCH_DUPLICATE_HOOK", "Factory history contains more than one launch for the same Hook address.");
      }
      cache.launchesByHook.set(addressKey, { args: event, origin });
    }
    cache.scannedThroughBlock = toBlock;
  }
  return cache.launchesByHook.get(hook.toLowerCase());
}

async function getFactoryLaunchLogs(
  client: PublicClient,
  factory: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<FactoryLaunchLog[]> {
  return await client.getLogs({
    address: factory,
    event: BOSS_LAUNCHED_EVENT,
    fromBlock,
    toBlock,
  }) as unknown as FactoryLaunchLog[];
}

function decodeFactoryLaunchLog(log: { data: Hex; topics: readonly Hex[] }): BossLaunchedArgs | undefined {
  try {
    const event = decodeEventLog({ abi: [BOSS_LAUNCHED_EVENT], data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true });
    if (event.eventName !== "BossLaunched") return undefined;
    return event.args as BossLaunchedArgs;
  } catch (error) {
    throw new DeploymentResolutionError("FACTORY_LAUNCH_LOG_MALFORMED", "A Boss Factory launch log could not be decoded.", { cause: error });
  }
}

function decodeFactoryLaunchReceipt(
  receipt: Awaited<ReturnType<PublicClient["getTransactionReceipt"]>>,
  origin: FactoryBossOrigin,
  factory: Address,
): { args: BossLaunchedArgs; logIndex: number } {
  const matches = [];
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, factory) || log.logIndex !== origin.launchLogIndex) continue;
    const args = decodeFactoryLaunchLog(log);
    if (args) matches.push({ args, logIndex: log.logIndex });
  }
  if (matches.length !== 1 || !sameHex(matches[0]!.args.bossId, origin.bossId)) {
    throw new DeploymentResolutionError("FACTORY_RECEIPT_MISMATCH", "The recorded Factory launch log identity does not match its receipt.");
  }
  return matches[0]!;
}

function assertLaunchMatchesManifest(args: BossLaunchedArgs, manifest: DeploymentManifest, origin: FactoryBossOrigin): void {
  const { hook, router, bossHP, collectibles } = manifest.addresses;
  if (!sameAddress(args.hook, hook) || !sameAddress(args.router, router) || !sameAddress(args.token, bossHP) ||
      !sameAddress(args.collectibles, collectibles) || !sameHex(args.bossId, origin.bossId) ||
      args.tokenAllocation <= args.prizeAmount || args.prizeAmount <= 0n || args.volumeTargetMockUSD < 6n ||
      args.hpPriceTick < -887_220 || args.hpPriceTick > 885_300 || args.hpPriceTick % 60 !== 0) {
    throw new DeploymentResolutionError("FACTORY_LAUNCH_MISMATCH", "BossLaunched event fields do not match the resolved encounter manifest.");
  }
}

function expectedStageVolumeTargets(target: bigint): readonly [bigint, bigint, bigint] {
  const first = target / 6n;
  const second = target / 3n;
  return [first, second, target - first - second];
}

function canonicalPoolKey(currencyA: Address, currencyB: Address, hooks: Address) {
  const [currency0, currency1] = currencyA.toLowerCase() < currencyB.toLowerCase()
    ? [currencyA, currencyB]
    : [currencyB, currencyA];
  return { currency0, currency1, fee: 3_000, tickSpacing: 60, hooks } as const;
}

function samePoolKey(actual: { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address }, expected: ReturnType<typeof canonicalPoolKey>): boolean {
  return sameAddress(actual.currency0, expected.currency0) && sameAddress(actual.currency1, expected.currency1) &&
    actual.fee === expected.fee && actual.tickSpacing === expected.tickSpacing && sameAddress(actual.hooks, expected.hooks);
}

function poolKeyId(key: ReturnType<typeof canonicalPoolKey>): Hex {
  return keccak256(encodeAbiParameters(POOL_KEY_ABI, [key]));
}

function hasHookFlags(hook: Address): boolean {
  return (BigInt(hook) & HOOK_FLAG_MASK) === HOOK_FLAGS;
}

function tokenMetadata(info: Awaited<ReturnType<typeof readErc20TokenInfo>>): TokenMetadata {
  return Object.freeze({ address: info.address, symbol: info.symbol, decimals: info.decimals });
}

function sameOrigin(left: FactoryBossOrigin, right: FactoryBossOrigin): boolean {
  return left.kind === right.kind && sameAddress(left.factoryAddress, right.factoryAddress) &&
    left.factoryDeployedAtBlock === right.factoryDeployedAtBlock && sameHex(left.bossId, right.bossId) &&
    sameHex(left.launchTxHash, right.launchTxHash) && left.launchLogIndex === right.launchLogIndex &&
    left.launchBlockNumber === right.launchBlockNumber;
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function sameHex(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function manifestIdentity(manifest: DeploymentManifest): string {
  const { addresses } = manifest;
  const origin = manifest.bossOrigin;
  return [manifest.chainId, manifest.deploymentTxHash.toLowerCase(), manifest.deployedAtBlock,
    manifest.bossFactory?.toLowerCase() ?? "", manifest.bossFactoryDeployedAtBlock ?? "",
    origin?.factoryAddress.toLowerCase() ?? "", origin?.bossId.toLowerCase() ?? "",
    origin?.launchTxHash.toLowerCase() ?? "", origin?.launchLogIndex ?? "", origin?.launchBlockNumber ?? "",
    addresses.hook.toLowerCase(), addresses.router.toLowerCase(), addresses.bossHP.toLowerCase(),
    addresses.roy.toLowerCase(), addresses.mockUSD.toLowerCase(), addresses.collectibles.toLowerCase(),
    addresses.poolManager.toLowerCase()].join(":");
}

function isNonnegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isHashValue(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-fA-F]{64}$/.test(value);
}

function immutableSnapshot<T>(value: T): T {
  const snapshot = structuredClone(value);
  const visited = new WeakSet<object>();
  const freeze = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) return;
    visited.add(candidate);
    for (const item of Object.values(candidate)) freeze(item);
    Object.freeze(candidate);
  };
  freeze(snapshot);
  return snapshot;
}

export function isVerifiedDeployment(value: unknown, client?: PublicClient): value is VerifiedDeployment {
  return Boolean(
    value && typeof value === "object" && verifiedDeployments.has(value) &&
    (!client || verificationClients.get(value) === client),
  );
}

function managerAddress(manifest: DeploymentManifest): Address {
  return manifest.addresses.poolManager;
}

function networkName(chainId: SupportedChainId): string {
  if (chainId === LOCAL_CHAIN_ID) return "Boss Pool Local";
  if (chainId === BASE_SEPOLIA_CHAIN_ID) return "Base Sepolia";
  return "Robinhood Testnet (historical)";
}

function isAddressValue(value: unknown): value is Address {
  return typeof value === "string" && isAddress(value);
}
