import { describe, expect, test } from "bun:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  WaitForTransactionReceiptTimeoutError,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  FactoryOperationPendingError,
  FactoryOperationTerminalError,
  createBossFactorySdk,
  type FactoryPendingOperation,
} from "./factory-sdk";
import { bossFactoryAbi } from "./generated/abi";
import { bossHookCreationCode, bossRouterCreationCode } from "./generated/bytecode";

const factory = "0x0000000000000000000000000000000000000010" as Address;
const token = "0x0000000000000000000000000000000000000020" as Address;
const maker = "0x0000000000000000000000000000000000000030" as Address;
const hook = "0x0000000000000000000000000000000000000040" as Address;
const router = "0x0000000000000000000000000000000000000050" as Address;
const collectibles = "0x0000000000000000000000000000000000000060" as Address;
const userSalt = `0x${"11".repeat(32)}` as Hex;
const hookSalt = `0x${"12".repeat(32)}` as Hex;
const bossId = keccak256(encodeAbiParameters([{ type: "address" }, { type: "bytes32" }], [maker, userSalt]));
const hash = `0x${"22".repeat(32)}` as Hex;
const replacementHash = `0x${"33".repeat(32)}` as Hex;
const launchConfig = {
  token,
  tokenAllocation: 1000n,
  prizeBps: 1000,
  volumeTargetMockUSD: 6000n,
  deadline: 2_000_000_000n,
  maxAttackTokenPerMockUSDX128: 123_456_789n,
};
const calldata = encodeFunctionData({
  abi: bossFactoryAbi,
  functionName: "launchBoss",
  args: [launchConfig, userSalt, hookSalt, "0x01", "0x02"],
});

function launchOperation(): Extract<FactoryPendingOperation, { kind: "launch" }> {
  return {
    version: 1,
    kind: "launch",
    chainId: 84532,
    hash,
    account: maker,
    factory,
    bossId,
    userSalt,
    config: {
      token,
      tokenAllocation: launchConfig.tokenAllocation.toString(),
      prizeBps: 1000,
      volumeTargetMockUSD: launchConfig.volumeTargetMockUSD.toString(),
      deadline: launchConfig.deadline.toString(),
      maxAttackTokenPerMockUSDX128: launchConfig.maxAttackTokenPerMockUSDX128.toString(),
    },
    expected: { prizeAmount: "100", hpPriceTick: 120 },
    calldata,
    submittedAt: 1,
  };
}

function launchReceipt(txHash: Hex = hash, overrides: Record<string, unknown> = {}) {
  const eventArgs = {
    bossId,
    maker,
    token,
    hook,
    router,
    collectibles,
    tokenAllocation: 1000n,
    prizeAmount: 100n,
    volumeTargetMockUSD: 6000n,
    hpPriceTick: 120,
  };
  const topics = encodeEventTopics({
    abi: bossFactoryAbi,
    eventName: "BossLaunched",
    args: eventArgs,
  });
  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }, { type: "int24" }],
    [hook, router, collectibles, 1000n, 100n, 6000n, 120],
  );
  return {
    transactionHash: txHash,
    status: "success",
    from: maker,
    to: factory,
    logs: [{ address: factory, data, topics }],
    ...overrides,
  } as never;
}

function transaction(input: Hex = calldata, txHash: Hex = hash, overrides: Record<string, unknown> = {}) {
  return {
    hash: txHash,
    from: maker,
    to: factory,
    input,
    value: 0n,
    chainId: 84532,
    ...overrides,
  };
}

function sdkWith(client: Record<string, unknown>) {
  return createBossFactorySdk({ publicClient: client as unknown as PublicClient, factory });
}

describe("factory SDK pending operations", () => {
  test("keeps a launch unresolved on timeout, then recovers and validates its config event", async () => {
    const operation = launchOperation();
    let waitCount = 0;
    let client = sdkWith({
      getChainId: async () => 84532,
      waitForTransactionReceipt: async () => {
        waitCount++;
        if (waitCount === 1) throw new WaitForTransactionReceiptTimeoutError({ hash });
        return launchReceipt();
      },
      getTransaction: async () => transaction(),
    });
    let pending: FactoryOperationPendingError | undefined;
    try {
      await client.resumeOperation(operation);
    } catch (error) {
      if (error instanceof FactoryOperationPendingError) pending = error;
      else throw error;
    }
    expect(pending?.operation).toEqual(operation);

    const restored = JSON.parse(JSON.stringify(pending!.operation)) as FactoryPendingOperation;
    const result = await client.resumeOperation(restored);
    expect(result).toMatchObject({ kind: "launch", result: { hash, bossId, maker, token, hook, router, collectibles } });
  });

  test("accepts a repriced replacement only when every transaction field and the launch event match", async () => {
    const operation = launchOperation();
    const replacement = {
      reason: "repriced",
      transaction: transaction(calldata, replacementHash),
    };
    const client = sdkWith({
      getChainId: async () => 84532,
      waitForTransactionReceipt: async ({ onReplaced }: { onReplaced: (value: unknown) => void }) => {
        onReplaced(replacement);
        return launchReceipt(replacementHash);
      },
      getTransaction: async () => transaction(calldata, replacementHash),
    });
    expect(await client.resumeOperation(operation)).toMatchObject({
      kind: "launch",
      result: { hash: replacementHash, bossId, maker, token },
    });
  });

  test("marks a different replacement terminal instead of treating it as the launch", async () => {
    const operation = launchOperation();
    const replacement = {
      reason: "replaced",
      transaction: transaction("0xdeadbeef" as Hex, replacementHash),
    };
    const client = sdkWith({
      getChainId: async () => 84532,
      waitForTransactionReceipt: async ({ onReplaced }: { onReplaced: (value: unknown) => void }) => {
        onReplaced(replacement);
        return launchReceipt(replacementHash);
      },
      getTransaction: async () => transaction("0xdeadbeef" as Hex, replacementHash),
    });
    await expect(client.resumeOperation(operation)).rejects.toBeInstanceOf(FactoryOperationTerminalError);
  });

  test("treats a cancelled replacement as terminal even when it reports the original call data", async () => {
    const operation = launchOperation();
    const replacement = { reason: "cancelled", transaction: transaction(calldata, replacementHash) };
    const client = sdkWith({
      getChainId: async () => 84532,
      waitForTransactionReceipt: async ({ onReplaced }: { onReplaced: (value: unknown) => void }) => {
        onReplaced(replacement);
        return launchReceipt(replacementHash);
      },
      getTransaction: async () => transaction(calldata, replacementHash),
    });
    await expect(client.resumeOperation(operation)).rejects.toBeInstanceOf(FactoryOperationTerminalError);
  });

  test("keeps a confirmed receipt unresolved when saved config no longer matches launch calldata", async () => {
    const operation = launchOperation();
    const altered = {
      ...operation,
      config: { ...operation.config, maxAttackTokenPerMockUSDX128: "987654321" },
    };
    const client = sdkWith({
      getChainId: async () => 84532,
      waitForTransactionReceipt: async () => launchReceipt(),
      getTransaction: async () => transaction(),
    });
    await expect(client.resumeOperation(altered)).rejects.toMatchObject({
      name: "BossFactorySdkError",
      code: "LAUNCH_CALL_MISMATCH",
    });
  });

  test("confirms a pending approval from its exact Approval event even if the live allowance changed", async () => {
    const amount = 100n;
    const approvalHash = `0x${"44".repeat(32)}` as Hex;
    const approvalCalldata = encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [factory, amount] });
    const approvalTopics = encodeEventTopics({ abi: erc20Abi, eventName: "Approval", args: { owner: maker, spender: factory } });
    const approvalData = encodeAbiParameters([{ type: "uint256" }], [amount]);
    const operation: FactoryPendingOperation = {
      version: 1,
      kind: "approval",
      chainId: 84532,
      hash: approvalHash,
      account: maker,
      factory,
      token,
      amount: amount.toString(),
      calldata: approvalCalldata,
      submittedAt: 1,
    };
    const client = sdkWith({
      getChainId: async () => 84532,
      waitForTransactionReceipt: async () => ({
        transactionHash: approvalHash,
        status: "success",
        from: maker,
        to: token,
        logs: [{ address: token, data: approvalData, topics: approvalTopics }],
      }),
      getTransaction: async () => ({ ...transaction(approvalCalldata, approvalHash), to: token }),
      readContract: async () => 0n,
    });
    await expect(client.resumeOperation(operation)).resolves.toMatchObject({
      kind: "approval",
      hash: approvalHash,
      token,
      allowance: 0n,
    });
  });

  test("uses the first selected JSON-RPC account, while preserving configured local signers", async () => {
    const jsonRpcClient = createBossFactorySdk({
      publicClient: sdkPublicClient() as unknown as PublicClient,
      factory,
      walletClient: {
        account: `0x0000000000000000000000000000000000000099`,
        getChainId: async () => 84532,
        getAddresses: async () => [maker, `0x0000000000000000000000000000000000000099`],
      } as never,
    });
    await expect(jsonRpcClient.approveToken(token, 1n)).rejects.toMatchObject({ code: "WALLET_ACCOUNT_CHANGED" });

    let simulatedAccount: Address | undefined;
    const localClient = createBossFactorySdk({
      publicClient: {
        ...sdkPublicClient(),
        readContract: async ({ functionName }: { functionName: string }) => {
          if (functionName === "routerCodeHash") return keccak256(bossRouterCreationCode);
          if (functionName === "hookCodeHash") return keccak256(bossHookCreationCode);
          return 0n;
        },
        simulateContract: async ({ account }: { account: Address }) => {
          simulatedAccount = account;
          throw new Error("stop before signing");
        },
      } as unknown as PublicClient,
      factory,
      walletClient: {
        account: { type: "local", address: maker },
        getChainId: async () => 84532,
        getAddresses: async () => [],
      } as never,
    });
    await expect(localClient.approveToken(token, 1n)).rejects.toThrow("stop before signing");
    expect(simulatedAccount).toBe(maker);
  });

  test("blocks quote and approval against a Factory with different immutable bytecode hashes", async () => {
    const calls: string[] = [];
    let simulated = 0;
    let writes = 0;
    const client = createBossFactorySdk({
      publicClient: {
        ...sdkPublicClient(),
        readContract: async ({ functionName }: { functionName: string }) => {
          calls.push(functionName);
          if (functionName === "routerCodeHash") return `0x${"ff".repeat(32)}`;
          if (functionName === "hookCodeHash") return `0x${"ee".repeat(32)}`;
          return 0n;
        },
        simulateContract: async () => { simulated++; throw new Error("should not simulate"); },
        waitForTransactionReceipt: async () => launchReceipt(),
        getTransaction: async () => transaction(),
      } as unknown as PublicClient,
      factory,
      walletClient: {
        getChainId: async () => 84532,
        getAddresses: async () => [maker],
        writeContract: async () => { writes++; return hash; },
      } as never,
    });
    const config = {
      token,
      tokenAllocation: 1000n,
      prizeBps: 1000,
      volumeTargetMockUSD: 6000n,
      deadline: 2_000_000_000n,
      maxAttackTokenPerMockUSDX128: 0n,
    };

    await expect(client.checkFactoryBuild()).resolves.toMatchObject({ status: "incompatible" });
    await expect(client.quoteLaunch(config)).rejects.toMatchObject({ code: "FACTORY_BUILD_MISMATCH" });
    await expect(client.approveToken(token, 1n)).rejects.toMatchObject({ code: "FACTORY_BUILD_MISMATCH" });
    expect(calls).not.toContain("quoteLaunch");
    expect(calls).not.toContain("allowance");
    expect(simulated).toBe(0);
    expect(writes).toBe(0);
    await expect(client.resumeOperation(launchOperation())).resolves.toMatchObject({
      kind: "launch",
      result: { bossId, maker, token },
    });
  });
});

function sdkPublicClient() {
  return {
    chain: { id: 84532 },
    getCode: async () => "0x01",
    getChainId: async () => 84532,
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "routerCodeHash") return keccak256(bossRouterCreationCode);
      if (functionName === "hookCodeHash") return keccak256(bossHookCreationCode);
      return 0n;
    },
  };
}
