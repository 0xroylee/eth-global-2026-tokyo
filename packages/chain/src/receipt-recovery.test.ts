import { expect, test } from "bun:test";
import {
  decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData,
  encodePacked, erc20Abi, maxUint256, parseAbi, type Address, type Hex, type PublicClient,
  type TransactionReceipt,
} from "viem";
import { verifyDeployment } from "./deployment";
import { createBossFactorySdk } from "./factory-sdk";
import { createBossPoolSdk, type PendingRequest } from "./sdk";
import fixture from "./fixtures/metamask-approval.json";

const account = fixture.account as Address;
const token = fixture.token as Address;
const router = fixture.spender as Address;
const hash = fixture.hash as Hex;
const other: Address = "0x0000000000000000000000000000000000000001";
const calldata = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [router, maxUint256] });
const delegated = {
  hash, from: fixture.from as Address, to: fixture.to as Address,
  input: fixture.input as Hex, value: 0n, chainId: 84532,
};
const direct = { ...delegated, from: account, to: token, input: calldata };
const request: PendingRequest = { kind: "approval", hash, account, target: token, calldata, chainId: 84532 };
const redemptionAbi = parseAbi(["function redeemDelegations(bytes[],bytes32[],bytes[])"]);

async function setup(transaction = delegated, receiptOverrides: Partial<TransactionReceipt> = {}, replacementReason?: string) {
  const addresses = { hook: other, router, mockUSD: token, bossHP: other, roy: other, collectibles: other, poolManager: other };
  const receipt = {
    transactionHash: transaction.hash, from: transaction.from, to: transaction.to, status: "success",
    logs: [{ address: token, topics: encodeEventTopics({ abi: erc20Abi, eventName: "Approval", args: { owner: account, spender: router } }),
      data: encodeAbiParameters([{ type: "uint256" }], [maxUint256]) }],
    ...receiptOverrides,
  };
  const client = {
    getChainId: async () => 84532,
    getBlockNumber: async () => 1n,
    getBlock: async () => ({ timestamp: 1n }),
    getCode: async () => "0x01",
    getTransactionReceipt: async () => ({ status: "success", blockNumber: 1n, contractAddress: router }),
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "symbol") return "TOKEN";
      if (functionName === "decimals") return 18;
      if (functionName === "allowance") return maxUint256;
      if (functionName === "manager") return other;
      if (functionName === "bossHook" || functionName === "minter") return other;
      return addresses[functionName as keyof typeof addresses];
    },
    waitForTransactionReceipt: async ({ onReplaced }: { onReplaced: (value: unknown) => void }) => {
      if (replacementReason) onReplaced({ reason: replacementReason, transaction });
      return receipt;
    },
    getTransaction: async () => transaction,
  } as unknown as PublicClient;
  const deployment = await verifyDeployment(client, {
    schemaVersion: 1, chainId: 84532, network: "base-sepolia", deployedAtBlock: 1,
    deploymentTxHash: hash, addresses,
  });
  return {
    pool: createBossPoolSdk({ publicClient: client, deployment }),
    factory: createBossFactorySdk({ publicClient: client, factory: router }),
  };
}

test("recovers the recorded MetaMask approval through both SDKs without resubmitting", async () => {
  const { pool, factory } = await setup();
  await expect(pool.resumePending(request).wait()).resolves.toMatchObject({ status: "confirmed", hash });
  await expect(factory.resumeOperation({
    version: 1, kind: "approval", chainId: 84532, hash, account, factory: router,
    token, amount: maxUint256.toString(), calldata, submittedAt: 1,
  })).resolves.toMatchObject({ kind: "approval", hash, token });
});

test("keeps direct approvals and repriced delegated approvals recoverable", async () => {
  for (const transaction of [direct, delegated]) {
    const { pool } = await setup(transaction, {}, "repriced");
    await expect(pool.resumePending(request).wait()).resolves.toMatchObject({ status: "confirmed", replaced: true });
  }
});

test("rejects mismatched delegated requests and unsupported envelopes", async () => {
  const { args } = decodeFunctionData({ abi: redemptionAbi, data: delegated.input });
  const encode = (contexts = args[0], modes = args[1], executions = args[2]) =>
    encodeFunctionData({ abi: redemptionAbi, functionName: "redeemDelegations", args: [contexts, modes, executions] });
  const transactions = [
    { ...delegated, to: other },
    { ...delegated, chainId: 1 },
    { ...delegated, value: 1n },
    { ...delegated, input: "0xdeadbeef" as Hex },
    { ...delegated, input: encode(args[0], [`0x0001${"00".repeat(30)}`]) },
    { ...delegated, input: encode([...args[0], ...args[0]], [...args[1], ...args[1]], [...args[2], ...args[2]]) },
    { ...delegated, input: encode(args[0], args[1], [`${args[2][0]}00`]) },
    { ...delegated, input: encode(args[0], args[1], [encodePacked(["address", "uint256", "bytes"], [other, 0n, calldata])]) },
    { ...delegated, input: encode(args[0], args[1], [encodePacked(["address", "uint256", "bytes"], [token, 1n, calldata])]) },
    { ...delegated, input: encode(["0x"], args[1], args[2]) },
  ];
  for (const transaction of transactions) {
    const { pool } = await setup(transaction);
    await expect(pool.resumePending(request).wait()).rejects.toMatchObject({ code: "RECEIPT_MISMATCH" });
  }
  const { pool } = await setup();
  await expect(pool.resumePending({ ...request, account: other }).wait()).rejects.toMatchObject({ code: "RECEIPT_MISMATCH" });
});

test("still requires the expected receipt events and handles reverts and cancellations", async () => {
  const missingEvent = await setup(delegated, { logs: [] });
  await expect(missingEvent.pool.resumePending(request).wait()).rejects.toMatchObject({ code: "RECEIPT_EVENT_MISSING" });
  const mismatchedReceipt = await setup(delegated, { from: other });
  await expect(mismatchedReceipt.pool.resumePending(request).wait()).rejects.toMatchObject({ code: "RECEIPT_MISMATCH" });
  const wrongOwner = await setup(delegated, { logs: [{
    address: token,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: "Approval", args: { owner: other, spender: router } }),
    data: encodeAbiParameters([{ type: "uint256" }], [maxUint256]),
  }] as TransactionReceipt["logs"] });
  await expect(wrongOwner.pool.resumePending(request).wait()).rejects.toMatchObject({ code: "RECEIPT_EVENT_MISMATCH" });
  const reverted = await setup(delegated, { status: "reverted" });
  await expect(reverted.pool.resumePending(request).wait()).rejects.toMatchObject({ code: "TRANSACTION_REVERTED" });
  const cancelled = await setup(delegated, {}, "cancelled");
  await expect(cancelled.pool.resumePending(request).wait()).rejects.toMatchObject({ code: "TRANSACTION_REPLACED" });
});
