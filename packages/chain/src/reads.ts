import { BlockNotFoundError, type Address, type PublicClient } from "viem";
import {
  bossHpAbi,
  bossPoolHookAbi,
  bossRouterAbi,
  mockUsdAbi,
  royTokenAbi,
} from "./generated/abi";
import type { EncounterMode, TokenMetadata, VerifiedDeployment } from "./deployment";

const STANDALONE_MODE: EncounterMode = "standalone";

export type RoundSnapshot = {
  blockNumber: bigint;
  blockTimestamp: bigint;
  encounterMode: EncounterMode;
  hpToken: TokenMetadata;
  rewardToken: TokenMetadata;
  deadline: bigint;
  status: number;
  currentStage: number;
  stageSold: readonly [bigint, bigint, bigint];
  stageCapacity: readonly [bigint, bigint, bigint];
  stageVolume: readonly [bigint, bigint, bigint];
  stageVolumeTarget: readonly [bigint, bigint, bigint];
  totalVolume: bigint;
  volumeTargetMockUSD: bigint;
  stageEndSqrtPriceX96: readonly [bigint, bigint, bigint];
  remainingSellableHP: bigint;
  supplyPoolFee: number;
  bossPoolFee: number;
  bossHPCurrency0: boolean;
  bossTickLower: number;
  bossTickUpper: number;
  bossSqrtLowerX96: bigint;
  bossSqrtUpperX96: bigint;
  bossCurrentSqrtPriceX96: bigint;
  /** @deprecated Use bossCurrentSqrtPriceX96; this historical name has always read the mutable current price. */
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
};

export type PlayerSnapshot = {
  blockNumber: bigint;
  account: Address;
  nativeBalance: bigint;
  mockUSDBalance: bigint;
  royBalance: bigint;
  bossHPBalance: bigint;
  attackAllowance: bigint;
  claimAllowance: bigint;
  hasAttacked: boolean;
  victoryClaimed: boolean;
  rewardCredit: bigint;
};

export type BossPoolSnapshot = {
  blockNumber: bigint;
  round: RoundSnapshot;
  player?: PlayerSnapshot;
};

export async function readRound(client: PublicClient, deployment: VerifiedDeployment): Promise<RoundSnapshot> {
  return (await readState(client, deployment)).round;
}

export async function readPlayer(
  client: PublicClient,
  deployment: VerifiedDeployment,
  account: Address,
): Promise<PlayerSnapshot> {
  const player = (await readState(client, deployment, account)).player;
  if (!player) throw new Error("Player state was not returned.");
  return player;
}

export async function readState(
  client: PublicClient,
  deployment: VerifiedDeployment,
  account?: Address,
): Promise<BossPoolSnapshot> {
  const { manifest } = deployment;
  const { hook, router, bossHP, roy, mockUSD, poolManager } = manifest.addresses;
  const encounterMode = deployment.encounterMode ?? STANDALONE_MODE;
  const hpToken = deployment.hpToken;
  const rewardToken = deployment.rewardToken;
  if (!hpToken || !rewardToken) throw new Error("Verified deployment is missing token metadata.");
  return withLatestSupportedBlock(client, async (blockNumber, blockTimestamp) => {
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
      remainingSellableHP,
      bossHPCurrency0,
      bossTickLower,
      bossTickUpper,
      bossSqrtLowerX96,
      bossSqrtUpperX96,
      bossCurrentSqrtPriceX96,
      deadline,
      originalPrize,
      mockUSDInHook,
      finalEligibleHP,
      redeemedHP,
      paidPrize,
      bossHPTotalSupply,
      bossHPInHook,
      bossHPInRouter,
      bossHPInPoolManager,
      supplyPoolKey,
      bossPoolKey,
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
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "remainingSellableHP", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "bossIsCurrency0", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "LOWER_TICK", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "UPPER_TICK", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "sqrtLowerX96", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "sqrtUpperX96", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "lastSqrtPriceX96", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "deadline", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "originalPrize", blockNumber }),
      client.readContract({ address: mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [hook], blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "finalEligibleHP", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "redeemedHP", blockNumber }),
      client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "paidPrize", blockNumber }),
      client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "totalSupply", blockNumber }),
      client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [hook], blockNumber }),
      client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [router], blockNumber }),
      client.readContract({ address: bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [poolManager], blockNumber }),
      client.readContract({ address: router, abi: bossRouterAbi, functionName: "supplyPoolKey", blockNumber }),
      client.readContract({ address: router, abi: bossRouterAbi, functionName: "bossPoolKey", blockNumber }),
    ]);
    const [volume0, volume1, volume2, target0, target1, target2, totalVolume, volumeTargetMockUSD] = encounterMode === "factory"
      ? await Promise.all([
          client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageVolume", args: [0], blockNumber }),
          client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageVolume", args: [1], blockNumber }),
          client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageVolume", args: [2], blockNumber }),
          client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageVolumeTarget", args: [0], blockNumber }),
          client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageVolumeTarget", args: [1], blockNumber }),
          client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "stageVolumeTarget", args: [2], blockNumber }),
          client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "totalVolume", blockNumber }),
          client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "volumeTargetMockUSD", blockNumber }),
        ])
      : [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n] as const;
    const round: RoundSnapshot = {
      blockNumber,
      blockTimestamp,
      encounterMode,
      hpToken,
      rewardToken,
      deadline,
      status,
      currentStage,
      stageSold: [sold0, sold1, sold2],
      stageCapacity: [capacity0, capacity1, capacity2],
      stageVolume: [volume0, volume1, volume2],
      stageVolumeTarget: [target0, target1, target2],
      totalVolume,
      volumeTargetMockUSD,
      stageEndSqrtPriceX96: [endPrice0, endPrice1, endPrice2],
      remainingSellableHP,
      supplyPoolFee: supplyPoolKey.fee,
      bossPoolFee: bossPoolKey.fee,
      bossHPCurrency0,
      bossTickLower,
      bossTickUpper,
      bossSqrtLowerX96,
      bossSqrtUpperX96,
      bossCurrentSqrtPriceX96,
      bossInitialSqrtPriceX96: bossCurrentSqrtPriceX96,
      originalPrize,
      mockUSDInHook,
      finalEligibleHP,
      redeemedHP,
      paidPrize,
      bossHPTotalSupply,
      bossHPInHook,
      bossHPInRouter,
      bossHPInPoolManager,
    };
    const player = account ? await readPlayerAtBlock(client, deployment, account, blockNumber) : undefined;
    return { blockNumber, round, player };
  });
}

async function readPlayerAtBlock(
  client: PublicClient,
  deployment: VerifiedDeployment,
  account: Address,
  blockNumber: bigint,
): Promise<PlayerSnapshot> {
  const { addresses } = deployment.manifest;
  const encounterMode = deployment.encounterMode ?? STANDALONE_MODE;
  const [
    nativeBalance,
    mockUSDBalance,
    royBalance,
    bossHPBalance,
    attackAllowance,
    claimAllowance,
    hasAttacked,
    victoryClaimed,
    rewardCredit,
  ] = await Promise.all([
    client.getBalance({ address: account, blockNumber }),
    client.readContract({ address: addresses.mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [account], blockNumber }),
    client.readContract({ address: addresses.roy, abi: royTokenAbi, functionName: "balanceOf", args: [account], blockNumber }),
    client.readContract({ address: addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [account], blockNumber }),
    client.readContract({ address: addresses.mockUSD, abi: mockUsdAbi, functionName: "allowance", args: [account, addresses.router], blockNumber }),
    encounterMode === "standalone"
      ? client.readContract({ address: addresses.bossHP, abi: bossHpAbi, functionName: "allowance", args: [account, addresses.hook], blockNumber })
      : Promise.resolve(0n),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "hasAttacked", args: [account], blockNumber }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "victoryClaimed", args: [account], blockNumber }),
    encounterMode === "factory"
      ? client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "rewardCredit", args: [account], blockNumber })
      : Promise.resolve(0n),
  ]);
  return {
    blockNumber,
    account,
    nativeBalance,
    mockUSDBalance,
    royBalance,
    bossHPBalance,
    attackAllowance,
    claimAllowance,
    hasAttacked,
    victoryClaimed,
    rewardCredit,
  };
}

async function withLatestSupportedBlock<T>(
  client: PublicClient,
  read: (blockNumber: bigint, timestamp: bigint) => Promise<T>,
): Promise<T> {
  const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
  let unsupportedCount = 0;
  while (true) {
    try {
      const block = await client.getBlock({ blockNumber });
      return await read(blockNumber, block.timestamp);
    } catch (error) {
      if (!isUnsupportedBlockError(error) || unsupportedCount >= 2) throw error;
      unsupportedCount++;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}

function isUnsupportedBlockError(error: unknown): boolean {
  const messages: string[] = [];
  const visited = new Set<object>();
  let current: unknown = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if (current instanceof BlockNotFoundError) return true;
    const record = current as { message?: unknown; name?: unknown; shortMessage?: unknown; cause?: unknown };
    if (record.name === "BlockNotFoundError") return true;
    if (typeof record.message === "string") messages.push(record.message);
    if (typeof record.shortMessage === "string") messages.push(record.shortMessage);
    current = record.cause;
  }
  const message = messages.join(" ");
  return (
    (/block/i.test(message) && /could not be found|not found/i.test(message)) ||
    /unknown block|header not found|historical state unavailable|state unavailable at block|unsupported block(?: number| parameter)?|block range.*not supported/i
      .test(message)
  );
}
