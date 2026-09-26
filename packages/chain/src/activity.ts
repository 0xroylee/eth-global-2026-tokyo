import {
  decodeEventLog,
  isAddress,
  toEventSelector,
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  isVerifiedDeployment,
  ROBINHOOD_TESTNET_CHAIN_ID,
  type VerifiedDeployment,
} from "./deployment";
import {
  bossCollectiblesAbi,
  bossHpAbi,
  bossPoolHookAbi,
  bossRouterAbi,
  mockUsdAbi,
  royTokenAbi,
} from "./generated/abi";

const DEFAULT_MAX_BLOCKS = 1_000;
const MAX_BLOCKS = 10_000;
export type ActivityCursor = Readonly<{
  version: 1;
  chainId: number;
  deploymentTxHash: Hex;
  deploymentKey: string;
  wallet: Address | null;
  rangeFromBlock: string;
  nextFromBlock: string;
  toBlock: string;
  snapshotBlockHash: Hex;
  maxBlocks: number;
}>;

export type ReadActivityOptions = {
  /** Event participant filter. This is never inferred from a transaction sender. */
  wallet?: Address;
  /** Defaults to the recorded Router deployment block; use 0n for earlier constructor/setup logs. */
  fromBlock?: bigint;
  /** Fixed upper bound for this scan. Omitted on the first page means the current observed head. */
  toBlock?: bigint;
  /** Maximum block span per call, from 1 to 10,000. */
  maxBlocks?: number;
  /** Continue an existing fixed-range scan. Its filters and bounds cannot be changed. */
  cursor?: ActivityCursor;
};

type ActivityBase = {
  id: string;
  chainId: number;
  deploymentTxHash: Hex;
  address: Address;
  blockNumber: bigint;
  blockHash: Hex;
  blockTimestamp: bigint;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
};

export type ActivityEntry =
  | (ActivityBase & {
      kind: "attack";
      authority: "authoritative-damage";
      player: Address;
      stage: number;
      mockUSDSpent: bigint;
      royBought: bigint;
      roySpent: bigint;
      bossHPReceived: bigint;
      mockUSDRefunded: bigint;
      royRefunded: bigint;
    })
  | (ActivityBase & {
      kind: "attack-recorded";
      authority: "corroborating-only";
      player: Address;
      stage: number;
      bossHPOut: bigint;
      cumulativeSold: bigint;
    })
  | (ActivityBase & { kind: "stage-cleared"; stage: number; sold: bigint; capacity: bigint; roundingDust: bigint })
  | (ActivityBase & { kind: "stage-refilled"; clearedStage: number; bossHPIn: bigint; royRecovered: bigint; nextStage: number })
  | (ActivityBase & { kind: "stage-activated"; stage: number; sqrtPriceX96: bigint; liquidity: bigint; capacity: bigint })
  | (ActivityBase & { kind: "round-activated"; bossPoolId: Hex; sqrtPriceX96: bigint; initialLiquidity: bigint })
  | (ActivityBase & { kind: "supply-pool-seeded"; poolId: Hex; sqrtPriceX96: bigint; tickLower: number; tickUpper: number; liquidity: bigint })
  | (ActivityBase & { kind: "boss-defeated"; finalEligibleHP: bigint; originalPrize: bigint })
  | (ActivityBase & { kind: "reward-claimed"; player: Address; bossHPIn: bigint; mockUSDOut: bigint })
  | (ActivityBase & { kind: "victory-nft-claimed"; player: Address; tokenId: bigint })
  | (ActivityBase & { kind: "round-expired"; timestamp: bigint })
  | (ActivityBase & { kind: "prize-funded"; maker: Address; amount: bigint })
  | (ActivityBase & { kind: "expired-prize-refunded"; maker: Address; amount: bigint })
  | (ActivityBase & { kind: "ownership-transferred"; previousOwner: Address; newOwner: Address })
  | (ActivityBase & {
      kind: "token-transfer";
      token: "MockUSD" | "ROY" | "BossHP";
      from: Address;
      to: Address;
      value: bigint;
    })
  | (ActivityBase & {
      kind: "token-approval";
      token: "MockUSD" | "ROY" | "BossHP";
      owner: Address;
      spender: Address;
      value: bigint;
    })
  | (ActivityBase & { kind: "nft-transfer"; token: "BossCollectibles"; from: Address; to: Address; tokenId: bigint })
  | (ActivityBase & { kind: "nft-approval"; token: "BossCollectibles"; owner: Address; approved: Address; tokenId: bigint })
  | (ActivityBase & { kind: "nft-approval-for-all"; token: "BossCollectibles"; owner: Address; operator: Address; approved: boolean });

type PendingActivityEntry = ActivityEntry extends infer Entry
  ? Entry extends ActivityBase ? Omit<Entry, "blockTimestamp"> : never
  : never;

export type ActivityPage = {
  chainId: number;
  deploymentTxHash: Hex;
  wallet?: Address;
  rangeFromBlock: bigint;
  rangeToBlock: bigint;
  scannedFromBlock: bigint;
  scannedToBlock: bigint;
  snapshotBlockNumber: bigint;
  snapshotBlockHash: Hex;
  /** True when this call scanned through the pinned block, for supported emitters/events only. */
  completeThroughSnapshot: boolean;
  entries: readonly ActivityEntry[];
  nextCursor?: ActivityCursor;
};

type Source = {
  name: string;
  address: Address;
  abi: Abi;
  events: readonly string[];
  token?: "MockUSD" | "ROY" | "BossHP" | "BossCollectibles";
};

type SelectedEvent = { name: string; abi: readonly [AbiEvent] };

const SOURCES = (addresses: VerifiedDeployment["manifest"]["addresses"]): readonly Source[] => [
  {
    name: "BossRouter",
    address: addresses.router,
    abi: bossRouterAbi,
    events: ["OwnershipTransferred", "SupplyPoolSeeded", "RoundActivated", "AttackExecuted", "StageRefilled"],
  },
  {
    name: "BossHook",
    address: addresses.hook,
    abi: bossPoolHookAbi,
    events: ["PrizeFunded", "StageActivated", "AttackRecorded", "StageCleared", "BossDefeated", "RewardClaimed", "VictoryNFTClaimed", "RoundExpired", "ExpiredPrizeRefunded"],
  },
  { name: "MockUSD", address: addresses.mockUSD, abi: mockUsdAbi, events: ["Approval", "Transfer"], token: "MockUSD" },
  { name: "ROY", address: addresses.roy, abi: royTokenAbi, events: ["Approval", "Transfer"], token: "ROY" },
  { name: "BossHP", address: addresses.bossHP, abi: bossHpAbi, events: ["Approval", "Transfer"], token: "BossHP" },
  {
    name: "BossCollectibles",
    address: addresses.collectibles,
    abi: bossCollectiblesAbi,
    events: ["Approval", "ApprovalForAll", "OwnershipTransferred", "Transfer"],
    token: "BossCollectibles",
  },
];

export async function readActivity(
  client: PublicClient,
  deployment: VerifiedDeployment,
  options: ReadActivityOptions = {},
): Promise<ActivityPage> {
  if (!isVerifiedDeployment(deployment, client)) {
    throw new Error("Activity reads require a deployment verified with this public client.");
  }
  if (deployment.chainId === ROBINHOOD_TESTNET_CHAIN_ID) {
    throw new Error("Activity history is unsupported for the historical enrollment-era Robinhood deployment.");
  }

  const { manifest } = deployment;
  const wallet = options.wallet;
  if (wallet !== undefined && !isAddress(wallet, { strict: false })) throw new Error("Activity wallet must be a valid address.");
  if (options.fromBlock !== undefined && typeof options.fromBlock !== "bigint") throw new Error("Activity start block must be a bigint.");
  if (options.toBlock !== undefined && typeof options.toBlock !== "bigint") throw new Error("Activity upper block must be a bigint.");
  const cursor = options.cursor;
  if (cursor) validateCursorShape(cursor);
  const normalizedWallet = (wallet?.toLowerCase() ?? cursor?.wallet?.toLowerCase()) as Address | undefined;
  if (normalizedWallet && !isAddress(normalizedWallet, { strict: false })) throw new Error("Activity cursor wallet must be a valid address.");
  const deploymentTxHash = manifest.deploymentTxHash as Hex;
  const deploymentKey = createDeploymentKey(deployment);
  const maxBlocks = resolveMaxBlocks(options.maxBlocks, cursor);
  const rangeFromBlock = cursor
    ? parseCursorBlock(cursor.rangeFromBlock, "cursor range start")
    : options.fromBlock ?? BigInt(manifest.deployedAtBlock);
  const fromBlock = cursor
    ? parseCursorBlock(cursor.nextFromBlock, "cursor next block")
    : rangeFromBlock;
  const toBlock = cursor
    ? parseCursorBlock(cursor.toBlock, "cursor range end")
    : options.toBlock ?? await client.getBlockNumber({ cacheTime: 0 });

  validateRange(rangeFromBlock, fromBlock, toBlock);
  if (cursor) {
    validateCursor(cursor, {
      chainId: deployment.chainId,
      deploymentTxHash,
      deploymentKey,
      wallet: normalizedWallet ?? null,
      rangeFromBlock,
      fromBlock,
      toBlock,
      maxBlocks,
      options,
    });
  }

  const chainId = await client.getChainId();
  if (chainId !== deployment.chainId) throw new Error(`Activity RPC chain is ${chainId}; expected ${deployment.chainId}.`);
  const head = await client.getBlockNumber({ cacheTime: 0 });
  if (toBlock > head) throw new Error(`Activity upper block ${toBlock} is above the current head ${head}.`);
  if (rangeFromBlock > head) throw new Error(`Activity start block ${rangeFromBlock} is above the current head ${head}.`);

  const snapshot = await client.getBlock({ blockNumber: toBlock });
  const snapshotBlockHash = snapshot.hash;
  if (!isHash(snapshotBlockHash)) throw new Error("Activity snapshot block has no canonical hash.");
  if (cursor && cursor.snapshotBlockHash.toLowerCase() !== snapshotBlockHash.toLowerCase()) {
    throw new Error("Activity cursor snapshot changed or was reorganized; restart the bounded scan.");
  }

  const scannedToBlock = minBigInt(toBlock, fromBlock + BigInt(maxBlocks) - 1n);
  const sources = SOURCES(manifest.addresses);
  const logsBySource = await Promise.all(sources.map((source) =>
    client.getLogs({ address: source.address, fromBlock, toBlock: scannedToBlock }),
  ));
  const pending: PendingActivityEntry[] = [];
  const blockHashes = new Map<bigint, Hex>();
  const seen = new Set<string>();

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex]!;
    const eventsByTopic = selectEvents(source.abi, source.events);
    for (const log of logsBySource[sourceIndex]!) {
      if (log.removed === true) throw new Error(`Removed ${source.name} log returned during activity scan.`);
      if (!sameAddress(log.address, source.address)) throw new Error(`RPC returned a log from an unverified ${source.name} address.`);
      const blockNumber = log.blockNumber;
      if (blockNumber === null || log.blockHash === null || log.transactionHash === null ||
          log.transactionIndex === null || log.logIndex === null) {
        throw new Error(`Pending or incomplete log returned from ${source.name}; historical activity requires mined log metadata.`);
      }
      if (blockNumber < fromBlock || blockNumber > scannedToBlock) {
        throw new Error(`RPC returned a ${source.name} log outside the requested activity block range.`);
      }
      if (!isHash(log.blockHash) || !isHash(log.transactionHash) || !Number.isSafeInteger(log.transactionIndex) ||
          log.transactionIndex < 0 || !Number.isSafeInteger(log.logIndex) || log.logIndex < 0) {
        throw new Error(`Malformed ${source.name} log identity; activity entries require block, transaction and log indices.`);
      }
      const priorBlockHash = blockHashes.get(blockNumber);
      if (priorBlockHash && priorBlockHash.toLowerCase() !== log.blockHash.toLowerCase()) {
        throw new Error(`RPC returned conflicting hashes for activity block ${blockNumber}.`);
      }
      blockHashes.set(blockNumber, log.blockHash);
      const topic0 = log.topics[0];
      if (!topic0) continue;
      const selected = eventsByTopic.get(topic0.toLowerCase());
      // Other contract events are outside this feed. Known signatures with malformed data fail below.
      if (!selected) continue;
      const identity = `${log.blockNumber}:${log.transactionHash.toLowerCase()}:${log.logIndex}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      let decoded: ReturnType<typeof decodeEventLog>;
      try {
        decoded = decodeEventLog({ abi: selected.abi, data: log.data, topics: log.topics, strict: true });
      } catch (error) {
        throw new Error(`Could not decode supported ${source.name}.${selected.name} activity log.`, { cause: error });
      }
      if (decoded.eventName !== selected.name) {
        throw new Error(`Decoded ${source.name} event does not match its indexed signature.`);
      }
      const args = decoded.args as Record<string, unknown>;
      const entry = createEntry(source, selected.name, args, {
        chainId: deployment.chainId,
        deploymentTxHash,
        blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        transactionIndex: log.transactionIndex,
        logIndex: log.logIndex,
      });
      if (!entry || (normalizedWallet && !includesParticipant(entry, normalizedWallet))) continue;
      pending.push(entry);
    }
  }

  const timestamps = await Promise.all([...blockHashes].map(async ([blockNumber, logBlockHash]) => {
    const block = await client.getBlock({ blockNumber });
    if (!isHash(block.hash) || block.hash.toLowerCase() !== logBlockHash.toLowerCase()) {
      throw new Error(`Activity log block ${blockNumber} changed during the scan; restart the bounded scan.`);
    }
    return [blockNumber, block.timestamp] as const;
  }));
  const timestampByBlock = new Map(timestamps);

  const afterScanSnapshot = await client.getBlock({ blockNumber: toBlock });
  if (afterScanSnapshot.hash?.toLowerCase() !== snapshotBlockHash.toLowerCase()) {
    throw new Error("Activity snapshot changed during the scan; no page or cursor was returned.");
  }

  const entries = pending.map((entry) => {
    const blockTimestamp = timestampByBlock.get(entry.blockNumber);
    if (blockTimestamp === undefined) throw new Error(`Activity block ${entry.blockNumber} has no timestamp.`);
    return { ...entry, blockTimestamp } as ActivityEntry;
  }).sort(compareEntries);
  const nextFromBlock = scannedToBlock + 1n;
  const completeThroughSnapshot = nextFromBlock > toBlock;
  const nextCursor: ActivityCursor | undefined = completeThroughSnapshot ? undefined : Object.freeze({
    version: 1,
    chainId: deployment.chainId,
    deploymentTxHash,
    deploymentKey,
    wallet: normalizedWallet ?? null,
    rangeFromBlock: rangeFromBlock.toString(),
    nextFromBlock: nextFromBlock.toString(),
    toBlock: toBlock.toString(),
    snapshotBlockHash,
    maxBlocks,
  });

  return {
    chainId: deployment.chainId,
    deploymentTxHash,
    ...(normalizedWallet ? { wallet: normalizedWallet } : {}),
    rangeFromBlock,
    rangeToBlock: toBlock,
    scannedFromBlock: fromBlock,
    scannedToBlock,
    snapshotBlockNumber: toBlock,
    snapshotBlockHash,
    completeThroughSnapshot,
    entries,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

function selectEvents(abi: Abi, names: readonly string[]): Map<string, SelectedEvent> {
  const events = new Map<string, SelectedEvent>();
  for (const item of abi) {
    if (item.type !== "event" || !names.includes(item.name)) continue;
    const event = item as AbiEvent;
    events.set(toEventSelector(event).toLowerCase(), { name: event.name, abi: [event] });
  }
  return events;
}

function createEntry(
  source: Source,
  eventName: string,
  args: Record<string, unknown>,
  log: Omit<ActivityBase, "id" | "address" | "blockTimestamp">,
): PendingActivityEntry | undefined {
  const base = {
    ...log,
    address: source.address,
    id: `${log.chainId}:${log.deploymentTxHash.toLowerCase()}:${log.blockNumber}:${log.blockHash.toLowerCase()}:${log.transactionHash.toLowerCase()}:${log.logIndex}`,
  };
  switch (eventName) {
    case "AttackExecuted":
      return {
        ...base, kind: "attack", authority: "authoritative-damage", player: asAddress(args.player), stage: asNumber(args.stage),
        mockUSDSpent: asBigInt(args.mockUSDSpent), royBought: asBigInt(args.royBought), roySpent: asBigInt(args.roySpent),
        bossHPReceived: asBigInt(args.bossHPReceived), mockUSDRefunded: asBigInt(args.mockUSDRefunded), royRefunded: asBigInt(args.royRefunded),
      };
    case "AttackRecorded":
      return {
        ...base, kind: "attack-recorded", authority: "corroborating-only", player: asAddress(args.player), stage: asNumber(args.stage),
        bossHPOut: asBigInt(args.bossHPOut), cumulativeSold: asBigInt(args.cumulativeSold),
      };
    case "StageCleared":
      return { ...base, kind: "stage-cleared", stage: asNumber(args.stage), sold: asBigInt(args.sold), capacity: asBigInt(args.capacity), roundingDust: asBigInt(args.roundingDust) };
    case "StageRefilled":
      return { ...base, kind: "stage-refilled", clearedStage: asNumber(args.clearedStage), bossHPIn: asBigInt(args.bossHPIn), royRecovered: asBigInt(args.royRecovered), nextStage: asNumber(args.nextStage) };
    case "StageActivated":
      return { ...base, kind: "stage-activated", stage: asNumber(args.stage), sqrtPriceX96: asBigInt(args.sqrtPriceX96), liquidity: asBigInt(args.liquidity), capacity: asBigInt(args.capacity) };
    case "RoundActivated":
      return { ...base, kind: "round-activated", bossPoolId: asHex(args.bossPoolId), sqrtPriceX96: asBigInt(args.sqrtPriceX96), initialLiquidity: asBigInt(args.initialLiquidity) };
    case "SupplyPoolSeeded":
      return { ...base, kind: "supply-pool-seeded", poolId: asHex(args.poolId), sqrtPriceX96: asBigInt(args.sqrtPriceX96), tickLower: asNumber(args.tickLower), tickUpper: asNumber(args.tickUpper), liquidity: asBigInt(args.liquidity) };
    case "BossDefeated":
      return { ...base, kind: "boss-defeated", finalEligibleHP: asBigInt(args.finalEligibleHP), originalPrize: asBigInt(args.originalPrize) };
    case "RewardClaimed":
      return { ...base, kind: "reward-claimed", player: asAddress(args.player), bossHPIn: asBigInt(args.bossHPIn), mockUSDOut: asBigInt(args.mockUSDOut) };
    case "VictoryNFTClaimed":
      return { ...base, kind: "victory-nft-claimed", player: asAddress(args.player), tokenId: asBigInt(args.tokenId) };
    case "RoundExpired":
      return { ...base, kind: "round-expired", timestamp: asBigInt(args.timestamp) };
    case "PrizeFunded":
      return { ...base, kind: "prize-funded", maker: asAddress(args.maker), amount: asBigInt(args.amount) };
    case "ExpiredPrizeRefunded":
      return { ...base, kind: "expired-prize-refunded", maker: asAddress(args.maker), amount: asBigInt(args.amount) };
    case "OwnershipTransferred":
      return { ...base, kind: "ownership-transferred", previousOwner: asAddress(args.previousOwner), newOwner: asAddress(args.newOwner) };
    case "Transfer":
      if (source.token === "BossCollectibles") {
        return { ...base, kind: "nft-transfer", token: source.token, from: asAddress(args.from), to: asAddress(args.to), tokenId: asBigInt(args.tokenId) };
      }
      if (!source.token) throw new Error("Token transfer log came from a non-token emitter.");
      return { ...base, kind: "token-transfer", token: source.token, from: asAddress(args.from), to: asAddress(args.to), value: asBigInt(args.value) };
    case "Approval":
      if (source.token === "BossCollectibles") {
        return { ...base, kind: "nft-approval", token: source.token, owner: asAddress(args.owner), approved: asAddress(args.approved), tokenId: asBigInt(args.tokenId) };
      }
      if (!source.token) throw new Error("Token approval log came from a non-token emitter.");
      return { ...base, kind: "token-approval", token: source.token, owner: asAddress(args.owner), spender: asAddress(args.spender), value: asBigInt(args.value) };
    case "ApprovalForAll":
      return { ...base, kind: "nft-approval-for-all", token: "BossCollectibles", owner: asAddress(args.owner), operator: asAddress(args.operator), approved: asBoolean(args.approved) };
    default:
      return undefined;
  }
}

function includesParticipant(entry: PendingActivityEntry, wallet: Address): boolean {
  switch (entry.kind) {
    case "attack":
    case "attack-recorded":
    case "reward-claimed":
    case "victory-nft-claimed":
      return sameAddress(entry.player, wallet);
    case "prize-funded":
    case "expired-prize-refunded":
      return sameAddress(entry.maker, wallet);
    case "ownership-transferred":
      return sameAddress(entry.previousOwner, wallet) || sameAddress(entry.newOwner, wallet);
    case "token-transfer":
    case "nft-transfer":
      return sameAddress(entry.from, wallet) || sameAddress(entry.to, wallet);
    case "token-approval":
      return sameAddress(entry.owner, wallet) || sameAddress(entry.spender, wallet);
    case "nft-approval":
      return sameAddress(entry.owner, wallet) || sameAddress(entry.approved, wallet);
    case "nft-approval-for-all":
      return sameAddress(entry.owner, wallet) || sameAddress(entry.operator, wallet);
    default:
      // Lifecycle entries with no indexed wallet participant stay in the global feed only.
      return false;
  }
}

function compareEntries(left: ActivityEntry, right: ActivityEntry): number {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber < right.blockNumber ? -1 : 1;
  if (left.transactionIndex !== right.transactionIndex) return left.transactionIndex - right.transactionIndex;
  return left.logIndex - right.logIndex;
}

function validateCursor(
  cursor: ActivityCursor,
  expected: {
    chainId: number;
    deploymentTxHash: Hex;
    deploymentKey: string;
    wallet: Address | null;
    rangeFromBlock: bigint;
    fromBlock: bigint;
    toBlock: bigint;
    maxBlocks: number;
    options: ReadActivityOptions;
  },
) {
  if (
    cursor.version !== 1 || cursor.chainId !== expected.chainId ||
    cursor.deploymentTxHash?.toLowerCase() !== expected.deploymentTxHash.toLowerCase() ||
    cursor.deploymentKey !== expected.deploymentKey ||
    (cursor.wallet?.toLowerCase() ?? null) !== expected.wallet ||
    cursor.rangeFromBlock !== expected.rangeFromBlock.toString() ||
    cursor.nextFromBlock !== expected.fromBlock.toString() ||
    cursor.toBlock !== expected.toBlock.toString() ||
    cursor.maxBlocks !== expected.maxBlocks || !isHash(cursor.snapshotBlockHash)
  ) throw new Error("Activity cursor does not match this deployment, wallet, block range, or page size.");
  if ((expected.options.fromBlock !== undefined && expected.options.fromBlock !== expected.rangeFromBlock) ||
      (expected.options.toBlock !== undefined && expected.options.toBlock !== expected.toBlock)) {
    throw new Error("Activity cursor cannot be combined with changed block bounds.");
  }
}

function validateCursorShape(cursor: ActivityCursor) {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor) ||
      (cursor.wallet !== null && (typeof cursor.wallet !== "string" || !isAddress(cursor.wallet, { strict: false }))) ||
      typeof cursor.deploymentTxHash !== "string" || !isHash(cursor.deploymentTxHash) ||
      typeof cursor.snapshotBlockHash !== "string" || !isHash(cursor.snapshotBlockHash)) {
    throw new Error("Activity cursor is malformed.");
  }
}

function resolveMaxBlocks(requested: number | undefined, cursor: ActivityCursor | undefined): number {
  const maxBlocks = requested ?? cursor?.maxBlocks ?? DEFAULT_MAX_BLOCKS;
  if (!Number.isSafeInteger(maxBlocks) || maxBlocks < 1 || maxBlocks > MAX_BLOCKS) {
    throw new Error(`Activity page size must be an integer from 1 to ${MAX_BLOCKS} blocks.`);
  }
  return maxBlocks;
}

function validateRange(rangeFromBlock: bigint, fromBlock: bigint, toBlock: bigint) {
  if (rangeFromBlock < 0n || fromBlock < 0n || toBlock < 0n) throw new Error("Activity block bounds cannot be negative.");
  if (fromBlock < rangeFromBlock) throw new Error("Activity cursor is before the requested range start.");
  if (toBlock < rangeFromBlock) throw new Error("Activity upper block is below the requested range start.");
  if (fromBlock > toBlock) throw new Error("Activity cursor is past the end of its pinned block range.");
}

function parseCursorBlock(value: string, label: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) throw new Error(`Activity ${label} is invalid.`);
  return BigInt(value);
}

function createDeploymentKey(deployment: VerifiedDeployment): string {
  const { addresses } = deployment.manifest;
  return [deployment.chainId, deployment.manifest.deploymentTxHash.toLowerCase(), addresses.router, addresses.hook,
    addresses.mockUSD, addresses.roy, addresses.bossHP, addresses.collectibles, addresses.poolManager]
    .map((part) => String(part).toLowerCase()).join(":");
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function isHash(value: unknown): value is Hex {
  return typeof value === "string" && /^0x[\da-fA-F]{64}$/.test(value);
}

function asAddress(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) throw new Error("Decoded activity address is invalid.");
  return value as Address;
}

function asBigInt(value: unknown): bigint {
  if (typeof value !== "bigint") throw new Error("Decoded activity integer is invalid.");
  return value;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "bigint" && value <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(value);
  throw new Error("Decoded activity integer is outside the supported range.");
}

function asHex(value: unknown): Hex {
  if (isHash(value)) return value;
  throw new Error("Decoded activity bytes32 value is invalid.");
}

function asBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Decoded activity boolean is invalid.");
  return value;
}
