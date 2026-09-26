import {
  createPublicClient,
  defineChain,
  http,
  isAddress,
  type Address,
  type Chain,
  type PublicClient,
} from "viem";
import {
  bossFactoryAbi,
  bossCollectiblesAbi,
  bossPoolHookAbi,
  bossRouterAbi,
} from "./generated/abi";

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
type ManifestBase = {
  schemaVersion: 1;
  deployedAtBlock: number;
  deploymentTxHash: `0x${string}`;
  deployer?: Address;
  bossFactory?: Address;
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
};

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
  const chain = defineChain({
    id: chainId,
    name: network,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  return createPublicClient({ chain, transport: http(rpcUrl) });
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
  });
  verifiedDeployments.add(verified);
  verificationClients.set(verified, client);
  return verified;
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
