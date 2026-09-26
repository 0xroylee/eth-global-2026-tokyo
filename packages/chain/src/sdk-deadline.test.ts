import { expect, test } from "bun:test";
import type { Address, PublicClient, WalletClient } from "viem";
import { verifyDeployment } from "./deployment";
import { createBossPoolSdk } from "./sdk";

// Exercise quote creation and final preparation through the public SDK with a fixed chain snapshot.
test.each([0n, 1_100n])("keeps transaction expiry for round deadline %s", async (deadline) => {
  const address = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;
  const addresses = { hook: address(1), router: address(2), bossHP: address(3), roy: address(4), mockUSD: address(5), collectibles: address(6), poolManager: address(7) };
  const account = address(8);
  const hash = `0x${"12".repeat(32)}` as const;
  let timestamp = 1_000n;
  const client = {
    getChainId: async () => 31337,
    getBlockNumber: async () => 1n,
    getBlock: async () => ({ number: 1n, timestamp }),
    getTransactionReceipt: async () => ({ status: "success", blockNumber: 1n, contractAddress: addresses.router }),
    getCode: async () => "0x01",
    readContract: async ({ functionName }: { functionName: string }) => {
      const fields: Record<string, unknown> = {
        manager: addresses.poolManager, router: addresses.router, bossHP: addresses.bossHP,
        roy: addresses.roy, mockUSD: addresses.mockUSD, collectibles: addresses.collectibles,
        bossHook: addresses.hook, minter: addresses.hook,
        symbol: "BHP", decimals: 18, status: 1, currentStage: 0, stageSold: 0n, stageCapacity: 1_000n,
        stageEndSqrtPriceX96: 0n, remainingSellableHP: 1_000n, bossIsCurrency0: true,
        LOWER_TICK: 0, UPPER_TICK: 1920, sqrtLowerX96: 1n, sqrtUpperX96: 2n,
        lastSqrtPriceX96: 1n, deadline, originalPrize: 1_000n, finalEligibleHP: 0n,
        redeemedHP: 0n, paidPrize: 0n, totalSupply: 2_000n, balanceOf: 0n,
        supplyPoolKey: { fee: 3000 }, bossPoolKey: { fee: 3000 },
      };
      if (!(functionName in fields)) throw new Error(`Unexpected read ${functionName}`);
      return fields[functionName];
    },
    simulateContract: async ({ functionName }: { functionName: string }) => ({
      result: functionName === "quoteAttackWithMockUSD"
        ? { mockUSDSpent: 100n, royBought: 100n, roySpent: 100n, bossHPOut: 100n, stageCleared: false, bossDefeated: false, nextStage: 0 }
        : [100n, 100n, 100n, 100n],
    }),
  } as unknown as PublicClient;
  const deployment = await verifyDeployment(client, {
    schemaVersion: 1, chainId: 31337, rpcUrl: "http://127.0.0.1:8547",
    deployedAtBlock: 1, deploymentTxHash: hash, addresses,
  });
  const walletClient = { getChainId: async () => 31337, getAddresses: async () => [account] } as unknown as WalletClient;
  const sdk = createBossPoolSdk({ publicClient: client, deployment, walletClient });
  const quote = await sdk.quoteAttack({ maxMockUSD: 100n });
  expect(quote.expiresAt).toBe(deadline === 0n ? 1_300n : 1_099n);
  const prepared = await sdk.prepareAttack(quote);
  expect(prepared.callDeadline).toBe(quote.expiresAt);
  timestamp = quote.expiresAt;
  await expect(sdk.prepareAttack(quote)).rejects.toMatchObject({ reason: "expired" });
  timestamp = 2_000n;
  if (deadline === 0n) {
    expect((await sdk.quoteAttack({ maxMockUSD: 100n })).expiresAt).toBe(2_300n);
  } else {
    await expect(sdk.quoteAttack({ maxMockUSD: 100n })).rejects.toMatchObject({ code: "ROUND_EXPIRED" });
  }
});
