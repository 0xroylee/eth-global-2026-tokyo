import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createWalletClient,
  custom,
  defineChain,
  http,
  type Account,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import {
  bossCollectiblesAbi,
  bossHpAbi,
  bossPoolHookAbi,
  bossRouterAbi,
  mockUsdAbi,
  royTokenAbi,
  createLocalPublicClient,
  createBossPoolSdk,
  DEFAULT_LOCAL_RPC_URL,
  isLocalRpcUrl,
  LOCAL_CHAIN_ID,
  parseDeployment,
  parseLocalDeployment,
  verifyDeployment,
  type BossPoolSdk,
  type DeploymentManifest,
  type PendingOperation,
  type PendingRequest,
  type AttackQuote,
  type AttackResult,
  BossPoolSdkError,
  RequoteRequiredError,
} from "@boss-pool/chain";
import {
  assertCancunTransientStorage,
  loadTestnetConfig,
  sanitizeSecrets,
} from "./testnet-common";

const root = process.cwd();
const localManifestDefault = path.join(root, "apps/web/public/deployments/local.json");
const evidenceRoot = path.join(root, ".scratch/boss-pool-exercise");
const localPlayers = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
] as const satisfies readonly Address[];
const requiredWalletUSD = 3_000_000_000n;
const partialAttackUSD = 1_000_000n;
const clearingAttackUSD = 1_000_000_000n;
const firstClaimHP = 1n * 10n ** 18n;

type NetworkName = "local" | "testnet";
type ExerciseAddresses = {
  hook: Address;
  router: Address;
  bossHP: Address;
  roy: Address;
  mockUSD: Address;
  collectibles: Address;
  poolManager: Address;
};
type ExerciseWallet = {
  name: "A" | "B";
  address: Address;
  client: WalletClient<Transport, Chain | undefined, Account | undefined>;
  sdk: BossPoolSdk;
};
type ExerciseState = {
  schemaVersion: 1;
  network: NetworkName;
  chainId: number;
  deploymentTxHash: Hex;
  deploymentBlock: string;
  sourceCommit: string;
  exerciseScriptSha256: string;
  sourceDirty: boolean;
  addresses: ExerciseAddresses;
  players: { A: Address; B: Address };
  startedAt: string;
  startBlock: string;
  status: "running" | "failed" | "completed";
  currentStep: string;
  transactions: Array<{
    step: string;
    from: Address;
    hash: Hex;
    request: PendingRequest;
    status: "submitted" | "success" | "reverted";
    confirmedHash?: Hex;
    blockNumber?: string;
    gasUsed?: string;
  }>;
  checkpoints: Array<Record<string, string | number | boolean | string[]>>;
  failure?: string;
};
type Runtime = {
  network: NetworkName;
  chainId: number;
  client: PublicClient;
  wallets: { A: ExerciseWallet; B: ExerciseWallet };
  addresses: ExerciseAddresses;
  deploymentTxHash: Hex;
  deploymentBlock: bigint;
  manifestInput: DeploymentManifest;
  sdk: { public: BossPoolSdk; A: BossPoolSdk; B: BossPoolSdk };
  sanitize: (message: string) => string;
};

async function main() {
  const mode = process.argv[2];
  if (mode !== "local" && mode !== "testnet") {
    throw new Error("Usage: bun scripts/exercise-boss-pool.ts <local|testnet>.");
  }

  let runtime: Runtime | undefined;
  let state: ExerciseState | undefined;
  let evidencePath: string | undefined;
  let currentSanitizer = redactUrls;
  try {
    runtime = mode === "local" ? await localRuntime() : await testnetRuntime((config) => {
      currentSanitizer = (message) => sanitizeSecrets(message, config);
    });
    currentSanitizer = runtime.sanitize;
    state = await createState(runtime);
    evidencePath = await createEvidencePath(runtime.network);
    await saveEvidence(evidencePath, state);

    await runJourney(runtime, state, evidencePath);
    state.status = "completed";
    state.currentStep = "completed";
    await saveEvidence(evidencePath, state);

    console.log(`Boss Pool ${runtime.network} two-wallet exercise: PASS.`);
    console.log(`Receipts: ${state.transactions.length}; chain ${state.chainId}; final block ${state.checkpoints.at(-1)?.blockNumber}.`);
    console.log(`Evidence: ${path.relative(root, evidencePath)} (contains public addresses and receipts, no signer material or RPC URL).`);
  } catch (error) {
    const message = currentSanitizer(error instanceof Error ? error.message : "Unknown exercise failure.");
    if (state && evidencePath) {
      state.status = "failed";
      state.failure = message.slice(0, 1_000);
      await saveEvidence(evidencePath, state).catch(() => undefined);
      console.error(`Boss Pool exercise failed during ${state.currentStep}. Evidence: ${path.relative(root, evidencePath)}.`);
    }
    throw new Error(message);
  }
}

async function localRuntime(): Promise<Runtime> {
  const rpcUrl = process.env.LOCAL_RPC_URL ?? DEFAULT_LOCAL_RPC_URL;
  if (!isLocalRpcUrl(rpcUrl)) throw new Error("LOCAL_RPC_URL must be a credential-free loopback HTTP URL.");
  const manifestOverride = process.env.LOCAL_DEPLOYMENT_PATH;
  const manifestPath = path.resolve(manifestOverride ?? localManifestDefault);
  if (manifestOverride && !isPathInside(path.join(root, ".scratch"), manifestPath)) {
    throw new Error("LOCAL_DEPLOYMENT_PATH overrides must stay inside .scratch/.");
  }
  const manifest = parseLocalDeployment(JSON.parse(await readFile(manifestPath, "utf8")));
  if (manifest.rpcUrl !== rpcUrl) throw new Error("The local manifest RPC URL does not match LOCAL_RPC_URL.");

  const client = createLocalPublicClient(manifest);
  const chainId = await client.getChainId();
  if (chainId !== LOCAL_CHAIN_ID) throw new Error(`Refusing local exercise on chain ${chainId}.`);
  const deployment = await verifyDeployment(client, manifest);
  // Only after loopback and chain-ID guards: derive Anvil's public fixture accounts as local signers.
  const anvilMnemonic = "test test test test test test test test test test test junk";
  const accountA = mnemonicToAccount(anvilMnemonic, { addressIndex: 0 });
  const accountB = mnemonicToAccount(anvilMnemonic, { addressIndex: 1 });
  if (!sameAddress(accountA.address, localPlayers[0]) || !sameAddress(accountB.address, localPlayers[1])) {
    throw new Error("Configured local Anvil fixture accounts do not match the default account derivation.");
  }
  const chain = localChain(rpcUrl);
  const transport = http(rpcUrl, { retryCount: 0, timeout: 10_000 });
  const publicSdk = createBossPoolSdk({ publicClient: client, deployment });
  const walletClientA = createWalletClient({ account: accountA, chain, transport });
  const walletClientB = createWalletClient({ account: accountB, chain, transport });
  const wallets = {
    A: makeWallet("A", localPlayers[0], walletClientA, publicSdk.withWallet(walletClientA)),
    B: makeWallet("B", localPlayers[1], walletClientB, publicSdk.withWallet(walletClientB)),
  };
  return {
    network: "local",
    chainId,
    client,
    wallets,
    sdk: { public: publicSdk, A: wallets.A.sdk, B: wallets.B.sdk },
    addresses: manifest.addresses,
    deploymentTxHash: manifest.deploymentTxHash,
    deploymentBlock: BigInt(manifest.deployedAtBlock),
    manifestInput: manifest,
    sanitize: redactUrls,
  };
}

async function testnetRuntime(onConfig: (config: ReturnType<typeof loadTestnetConfig>) => void): Promise<Runtime> {
  const config = loadTestnetConfig();
  onConfig(config);
  await assertCancunTransientStorage(config.client);
  const manifestPath = path.join(root, "apps/web/public/deployments/robinhood-testnet.json");
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1 || raw.network !== "robinhood-testnet" ||
    raw.chainId !== 46_630 || typeof raw.deploymentTxHash !== "string" ||
    typeof raw.deployedAtBlock !== "number" || !Number.isSafeInteger(raw.deployedAtBlock) || raw.deployedAtBlock < 0
  ) throw new Error("The testnet manifest is missing its verified chain and deployment receipt metadata.");
  const manifest = parseDeployment(raw);
  if (!manifest.deployer || manifest.deployer.toLowerCase() !== config.deployerAddress.toLowerCase()) {
    throw new Error("TESTNET_DEPLOYER_PRIVATE_KEY does not match the manifest deployer.");
  }
  const deploymentTxHash = raw.deploymentTxHash as Hex;
  const deploymentBlockFromManifest = BigInt(raw.deployedAtBlock);
  const deployment = await verifyDeployment(config.client, manifest);

  const chain = robinhoodChain(config.rpcUrl);
  const transport = http(config.rpcUrl, { retryCount: 0, timeout: 15_000 });
  const accountA = privateKeyToAccount(config.deployerKey);
  const accountB = privateKeyToAccount(config.playerBKey);
  const publicSdk = createBossPoolSdk({ publicClient: config.client, deployment });
  const walletClientA = createWalletClient({ account: accountA, chain, transport });
  const walletClientB = createWalletClient({ account: accountB, chain, transport });
  const wallets = {
    A: makeWallet("A", accountA.address, walletClientA, publicSdk.withWallet(walletClientA)),
    B: makeWallet("B", accountB.address, walletClientB, publicSdk.withWallet(walletClientB)),
  };
  return {
    network: "testnet",
    chainId: 46_630,
    client: config.client,
    wallets,
    sdk: { public: publicSdk, A: wallets.A.sdk, B: wallets.B.sdk },
    addresses: manifest.addresses,
    deploymentTxHash,
    deploymentBlock: deploymentBlockFromManifest,
    manifestInput: manifest,
    sanitize: (message) => sanitizeSecrets(message, config),
  };
}

function localChain(rpcUrl: string): Chain {
  return defineChain({
    id: LOCAL_CHAIN_ID,
    name: "Boss Pool Local",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

function robinhoodChain(rpcUrl: string): Chain {
  return defineChain({
    id: 46_630,
    name: "Robinhood Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

function makeWallet(
  name: "A" | "B",
  address: Address,
  client: WalletClient<Transport, Chain | undefined, Account | undefined>,
  sdk: BossPoolSdk,
): ExerciseWallet {
  return { name, address, client, sdk };
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function createState(runtime: Runtime): Promise<ExerciseState> {
  const startBlock = await runtime.client.getBlockNumber({ cacheTime: 0 });
  const scriptSource = await readFile(path.join(root, "scripts/exercise-boss-pool.ts"));
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const sourceDirty = execFileSync("git", ["status", "--porcelain", "--", "scripts/exercise-boss-pool.ts"], { cwd: root, encoding: "utf8" }).trim().length > 0;
  return {
    schemaVersion: 1,
    network: runtime.network,
    chainId: runtime.chainId,
    deploymentTxHash: runtime.deploymentTxHash,
    deploymentBlock: runtime.deploymentBlock.toString(),
    sourceCommit,
    exerciseScriptSha256: createHash("sha256").update(scriptSource).digest("hex"),
    sourceDirty,
    addresses: runtime.addresses,
    players: { A: runtime.wallets.A.address, B: runtime.wallets.B.address },
    startedAt: new Date().toISOString(),
    startBlock: startBlock.toString(),
    status: "running",
    currentStep: "startup checks",
    transactions: [],
    checkpoints: [],
  };
}

async function createEvidencePath(network: NetworkName): Promise<string> {
  await mkdir(evidenceRoot, { recursive: true });
  const runId = `${new Date().toISOString().replaceAll(/[-:.]/g, "").replace("Z", "Z")}-${process.pid}`;
  return path.join(evidenceRoot, `${network}-${runId}.json`);
}

async function saveEvidence(filePath: string, state: ExerciseState): Promise<void> {
  const temporary = `${filePath}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`);
  await rename(temporary, filePath);
}

async function runJourney(runtime: Runtime, state: ExerciseState, evidencePath: string): Promise<void> {
  const { addresses, client, wallets } = runtime;
  const players = [wallets.A, wallets.B] as const;
  state.currentStep = "verify immutable SDK deployment boundary";
  await verifySdkSnapshotBoundary(runtime);
  if (runtime.network === "local") await verifyEip1193SelectionGuard(runtime);
  await saveEvidence(evidencePath, state);

  state.currentStep = "verify active round and token configuration";
  const initial = await readSnapshot(runtime);
  assert(initial.status === 1 && initial.currentStage === 0, "round must be Active at zero-based stage 0");
  assert(initial.stageSold.every((sold) => sold === 0n), "all stage counters must start at zero");
  assert(initial.finalEligibleHP === 0n && initial.redeemedHP === 0n, "reward accounting must start empty");
  assert(initial.originalPrize > 0n && initial.mockUSDInHook >= initial.originalPrize, "Hook must custody the full prize");
  assert(initial.bossHPTotalSupply === 2_000n * 10n ** 18n, "BossHP fixture supply must be 2,000 tokens");
  assert(initial.mockUSDDecimals === 6 && initial.royDecimals === 18 && initial.bossHPDecimals === 18, "token decimals changed");
  assert(initial.bossHPCustody === initial.bossHPTotalSupply, "BossHP supply must be in protocol or player custody");
  assert(!initial.enrolledA && !initial.enrolledB, "both wallets must be fresh for this round");
  assert(initial.stageCapacity[0] >= 300n * 10n ** 18n && initial.stageCapacity[0] <= 300n * 10n ** 18n + 1n, "stage 0 capacity changed");
  assert(initial.stageCapacity[1] >= 600n * 10n ** 18n && initial.stageCapacity[1] <= 600n * 10n ** 18n + 1n, "stage 1 capacity changed");
  assert(initial.stageCapacity[2] >= 900n * 10n ** 18n && initial.stageCapacity[2] <= 900n * 10n ** 18n + 1n, "stage 2 capacity changed");
  checkpoint(state, "active-round", initial);
  await saveEvidence(evidencePath, state);

  state.currentStep = "public quote before connection, enrollment, and approval";
  const stageZeroQuoteA = await runtime.sdk.public.quoteAttack({
    maxMockUSD: partialAttackUSD,
    stage: 0,
    account: wallets.A.address,
    validitySeconds: 900n,
  });
  const staleStageZeroQuoteB = await runtime.sdk.public.quoteAttack({
    maxMockUSD: clearingAttackUSD,
    stage: 0,
    account: wallets.B.address,
    slippageBps: 0,
    validitySeconds: 900n,
  });
  assert(stageZeroQuoteA.stage === 0 && staleStageZeroQuoteB.stage === 0, "public pre-enrollment quotes must use the active zero-based stage");
  assert(stageZeroQuoteA.mockUSDSpent > 0n && staleStageZeroQuoteB.bossHPOut > 0n, "public pre-approval quotes must contain real route outputs");
  await assertQuoteDidNotPersist(runtime, initial, "pre-enrollment public quote");
  checkpoint(state, "public-preapproval-quotes", initial, {
    quoteAStage: stageZeroQuoteA.stage,
    quoteAOutput: stageZeroQuoteA.bossHPOut.toString(),
    quoteBStage: staleStageZeroQuoteB.stage,
    quoteBOutput: staleStageZeroQuoteB.bossHPOut.toString(),
  });
  await saveEvidence(evidencePath, state);

  state.currentStep = "fund players with MockUSD faucet tokens";
  const mockUSDTotalSupplyBeforeFaucet = initial.mockUSDTotalSupply;
  for (const player of players) {
    const balance = (await player.sdk.readPlayer(player.address)).mockUSDBalance;
    if (balance < requiredWalletUSD) {
      const operation = await player.sdk.faucetMockUSD(requiredWalletUSD - balance);
      const confirmed = await submitPendingOperation(
        runtime,
        state,
        evidencePath,
        player,
        `faucet MockUSD to player ${player.name}`,
        operation,
      );
      assert(confirmed.result.amount === requiredWalletUSD - balance, `player ${player.name} faucet amount changed`);
      assert(confirmed.result.events.some((event) => event.eventName === "Transfer" && event.transactionHash === confirmed.hash), "faucet SDK result must expose its typed receipt log identity");
      if (player.name === "A") await assertFaucetReceiptCannotVerifyDeployment(runtime, confirmed.hash, confirmed.receipt);
    }
  }
  const mockUSDTotalSupplyAfterFaucet = await client.readContract({
    address: addresses.mockUSD,
    abi: mockUsdAbi,
    functionName: "totalSupply",
  });
  assert(mockUSDTotalSupplyAfterFaucet >= mockUSDTotalSupplyBeforeFaucet, "MockUSD faucet supply moved backwards");
  state.checkpoints.push({
    name: "mockusd-funded",
    mockUSDTotalSupplyBeforeFaucet: mockUSDTotalSupplyBeforeFaucet.toString(),
    mockUSDTotalSupplyAfterFaucet: mockUSDTotalSupplyAfterFaucet.toString(),
    requiredPerWallet: requiredWalletUSD.toString(),
  });
  await saveEvidence(evidencePath, state);

  state.currentStep = "approve and enroll both wallets";
  for (const player of players) {
    const enrollmentApproval = await player.sdk.approve({ kind: "enroll" });
    if (!("request" in enrollmentApproval)) {
      assert(enrollmentApproval.approval.currentAllowance >= enrollmentApproval.approval.requiredAllowance, "skipped enrollment approval must have enough allowance");
    } else {
      await submitPendingOperation(runtime, state, evidencePath, player, `approve Hook enrollment fee for player ${player.name}`, enrollmentApproval);
    }
    const [usdBeforeEnroll, royBeforeEnroll] = await Promise.all([
      client.readContract({ address: addresses.mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [player.address] }),
      client.readContract({ address: addresses.roy, abi: royTokenAbi, functionName: "balanceOf", args: [player.address] }),
    ]);
    const enrollment = await submitPendingOperation(
      runtime,
      state,
      evidencePath,
      player,
      `enroll player ${player.name}`,
      await player.sdk.enroll(),
    );
    const entryFee = enrollment.result.entryFee;
    const starterRoy = enrollment.result.starterRoy;
    assert(entryFee === initial.enrollmentFee && starterRoy === 100n * 10n ** 18n, `player ${player.name} enrollment event amounts changed`);
    const [usdAfterEnroll, royAfterEnroll] = await Promise.all([
      client.readContract({ address: addresses.mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [player.address] }),
      client.readContract({ address: addresses.roy, abi: royTokenAbi, functionName: "balanceOf", args: [player.address] }),
    ]);
    assert(usdBeforeEnroll - usdAfterEnroll === entryFee, `player ${player.name} paid the wrong enrollment fee`);
    assert(royAfterEnroll - royBeforeEnroll === starterRoy, `player ${player.name} received the wrong starter ROY amount`);
    const entryTokenId = enrollment.result.entryTokenId;
    const entryOwner = await client.readContract({
      address: addresses.collectibles,
      abi: bossCollectiblesAbi,
      functionName: "ownerOf",
      args: [entryTokenId],
    });
    assert(sameAddress(entryOwner, player.address), `entry NFT for player ${player.name} was not minted`);
    state.checkpoints.push({
      name: `enrolled-${player.name}`,
      entryTokenId: entryTokenId.toString(),
      entryFee: entryFee.toString(),
      starterRoy: starterRoy.toString(),
    });
    await saveEvidence(evidencePath, state);
  }

  const attackAllowanceA = await wallets.A.sdk.approve({ kind: "attack", maxMockUSD: stageZeroQuoteA.maxMockUSD });
  if ("request" in attackAllowanceA) {
    await submitPendingOperation(runtime, state, evidencePath, wallets.A, "approve Router attack spend for player A", attackAllowanceA);
  }
  const attackAllowanceB = await wallets.B.sdk.approve({ kind: "attack", maxMockUSD: staleStageZeroQuoteB.maxMockUSD });
  if ("request" in attackAllowanceB) {
    await submitPendingOperation(runtime, state, evidencePath, wallets.B, "approve Router attack spend for player B", attackAllowanceB);
  }

  const attackPlan = [
    { player: wallets.A, maxUSD: partialAttackUSD, stage: 0, label: "partial stage 0 attack" },
    { player: wallets.B, maxUSD: clearingAttackUSD, stage: 0, label: "clear stage 0" },
    { player: wallets.A, maxUSD: clearingAttackUSD, stage: 1, label: "clear stage 1" },
    { player: wallets.B, maxUSD: clearingAttackUSD, stage: 2, label: "clear stage 2" },
  ] as const;
  let priorRefills = 0;
  let expectedStageSold = [0n, 0n, 0n];
  let partialStageZeroResult = await runSdkAttack(runtime, state, evidencePath, attackPlan[0], stageZeroQuoteA, expectedStageSold, priorRefills, initial);
  expectedStageSold = partialStageZeroResult.expectedStageSold;
  priorRefills = partialStageZeroResult.priorRefills;

  const beforeStaleSameStage = await readSnapshot(runtime);
  const transactionCountBeforeStaleSameStage = state.transactions.length;
  await expectRequote(
    () => wallets.B.sdk.prepareAttack(staleStageZeroQuoteB),
    "slippage",
    "stage-0 same-stage quote must be rejected after A moves the pool price",
  );
  assert(state.transactions.length === transactionCountBeforeStaleSameStage, "stale same-stage quote must not submit a transaction");
  const afterStaleSameStage = await readSnapshot(runtime);
  assertSnapshotUnchanged(beforeStaleSameStage, afterStaleSameStage, "failed stale same-stage simulation");
  state.checkpoints.push({
    name: "stale-same-stage-quote-rejected",
    reason: "slippage",
    quotedBlock: staleStageZeroQuoteB.quotedBlock.toString(),
    actualStage: afterStaleSameStage.currentStage,
    transactionsBefore: transactionCountBeforeStaleSameStage,
    transactionsAfter: state.transactions.length,
  });
  await saveEvidence(evidencePath, state);

  const freshStageZeroQuoteB = await runtime.sdk.public.quoteAttack({
    maxMockUSD: attackPlan[1].maxUSD,
    stage: attackPlan[1].stage,
    account: wallets.B.address,
    validitySeconds: 900n,
  });
  const clearStageZeroResult = await runSdkAttack(runtime, state, evidencePath, attackPlan[1], freshStageZeroQuoteB, expectedStageSold, priorRefills, initial);
  expectedStageSold = clearStageZeroResult.expectedStageSold;
  priorRefills = clearStageZeroResult.priorRefills;

  const transactionCountBeforeStaleStage = state.transactions.length;
  await expectRequote(
    () => wallets.A.sdk.attack(stageZeroQuoteA),
    "stage-changed",
    "A's retained zero-based stage-0 quote must fail after B clears stage 0",
  );
  assert(state.transactions.length === transactionCountBeforeStaleStage, "stale-stage quote must not submit a transaction");
  state.checkpoints.push({
    name: "stale-stage-quote-rejected",
    reason: "stage-changed",
    quotedStage: stageZeroQuoteA.stage,
    actualStage: (await readSnapshot(runtime)).currentStage,
    transactionsBefore: transactionCountBeforeStaleStage,
    transactionsAfter: state.transactions.length,
  });
  await saveEvidence(evidencePath, state);

  for (const attack of attackPlan.slice(2)) {
    const quote = await runtime.sdk.public.quoteAttack({
      maxMockUSD: attack.maxUSD,
      stage: attack.stage,
      account: attack.player.address,
      validitySeconds: 900n,
    });
    const result = await runSdkAttack(runtime, state, evidencePath, attack, quote, expectedStageSold, priorRefills, initial);
    expectedStageSold = result.expectedStageSold;
    priorRefills = result.priorRefills;
  }

  state.currentStep = "transfer eligible BossHP rights from player B to A";
  const beforeTransfer = await readSnapshot(runtime);
  assert(beforeTransfer.status === 3, "HP transfer requires a defeated round");
  const transferAmount = beforeTransfer.bossHPB;
  assert(transferAmount > 0n, "player B must hold BossHP earned from attacks");
  const transfer = await submitPendingOperation(
    runtime,
    state,
    evidencePath,
    wallets.B,
    "transfer all player B BossHP to player A",
    await wallets.B.sdk.transferBossHP(wallets.A.address, transferAmount),
  );
  assert(transfer.result.amount === transferAmount && sameAddress(transfer.result.recipient, wallets.A.address), "SDK transfer result does not match the request");
  const afterTransfer = await readSnapshot(runtime);
  assert(afterTransfer.stageSold.every((amount, index) => amount === beforeTransfer.stageSold[index]), "BossHP transfer changed stage damage");
  assert(afterTransfer.finalEligibleHP === beforeTransfer.finalEligibleHP, "BossHP transfer changed eligible reward denominator");
  assert(afterTransfer.bossHPA === beforeTransfer.bossHPA + transferAmount && afterTransfer.bossHPB === 0n, "BossHP transfer did not move rights to player A");
  assert(afterTransfer.bossHPA === afterTransfer.finalEligibleHP, "all eligible HP must be held by player A after transfer");
  checkpoint(state, "eligible-hp-transferred", afterTransfer, { transferredHP: transferAmount.toString() });
  await saveEvidence(evidencePath, state);

  state.currentStep = "approve and redeem partial eligible BossHP";
  await claim(runtime, state, evidencePath, wallets.A, firstClaimHP, "partial reward claim");
  const afterPartialClaim = await readSnapshot(runtime);
  assert(afterPartialClaim.redeemedHP === firstClaimHP, "partial claim did not surrender the requested HP");
  assert(afterPartialClaim.bossHPInHook === firstClaimHP, "Hook must hold surrendered HP without burning it");
  assert(afterPartialClaim.bossHPTotalSupply === initial.bossHPTotalSupply, "partial claim changed BossHP total supply");

  state.currentStep = "approve and redeem remaining eligible BossHP";
  const remainingHP = afterPartialClaim.finalEligibleHP - afterPartialClaim.redeemedHP;
  await claim(runtime, state, evidencePath, wallets.A, remainingHP, "remaining reward claim");
  const afterClaims = await readSnapshot(runtime);
  assert(afterClaims.redeemedHP === afterClaims.finalEligibleHP, "all actual eligible HP must be surrendered after the final claim");
  assert(afterClaims.bossHPInHook === afterClaims.finalEligibleHP, "surrendered eligible HP must remain in Hook custody");
  assert(afterClaims.bossHPTotalSupply === initial.bossHPTotalSupply, "claims must not burn BossHP");
  assert(afterClaims.paidPrize <= afterClaims.originalPrize, "reward payouts exceeded the original prize");
  assert(afterClaims.originalPrize - afterClaims.paidPrize <= 1n, "two floor-rounded claims should leave at most one MockUSD base unit");
  assert(
    afterClaims.mockUSDInHook === afterClaims.originalPrize + 2n * initial.enrollmentFee - afterClaims.paidPrize,
    "Hook prize and enrollment-fee custody does not reconcile after claims",
  );
  checkpoint(state, "claims-complete", afterClaims, { remainingHP: remainingHP.toString() });
  await saveEvidence(evidencePath, state);

  state.currentStep = "claim both victory NFTs";
  for (const player of players) {
    assert((await player.sdk.readPlayer(player.address)).hasAttacked, `player ${player.name} has no attack record`);
    const victory = await submitPendingOperation(
      runtime,
      state,
      evidencePath,
      player,
      `claim victory NFT for player ${player.name}`,
      await player.sdk.claimVictoryNFT(),
    );
    const tokenId = victory.result.tokenId;
    assert(await client.readContract({ address: addresses.collectibles, abi: bossCollectiblesAbi, functionName: "isVictoryToken", args: [tokenId] }), `token ${tokenId} is not marked as a victory NFT`);
    const owner = await client.readContract({ address: addresses.collectibles, abi: bossCollectiblesAbi, functionName: "ownerOf", args: [tokenId] });
    assert(sameAddress(owner, player.address), `victory NFT for player ${player.name} was not delivered`);
    assert(await client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "victoryClaimed", args: [player.address] }), `victory NFT claim flag missing for player ${player.name}`);
    state.checkpoints.push({ name: `victory-nft-${player.name}`, tokenId: tokenId.toString() });
    await saveEvidence(evidencePath, state);
  }

  state.currentStep = "final supply, custody, rewards and stage checks";
  const final = await readSnapshot(runtime);
  assert(final.status === 3 && final.currentStage === 2, "completed round state changed after claims");
  assert(final.finalEligibleHP === final.stageSold.reduce((sum, amount) => sum + amount, 0n), "final eligible HP must remain actual sold output sum");
  assert(final.redeemedHP === final.finalEligibleHP && final.bossHPInHook === final.finalEligibleHP, "surrendered HP is not locked in Hook custody");
  assert(final.bossHPTotalSupply === initial.bossHPTotalSupply && final.royTotalSupply === initial.royTotalSupply, "fixed-supply tokens changed total supply");
  assert(final.mockUSDTotalSupply === mockUSDTotalSupplyAfterFaucet, "MockUSD supply changed after the explicit faucet phase");
  assert(final.bossHPCustody === final.bossHPTotalSupply, "BossHP balances do not reconcile to fixed supply");
  assert(final.victoryClaimedA && final.victoryClaimedB, "both players must independently claim victory NFTs");
  checkpoint(state, "final", final, { refills: priorRefills });
  await saveEvidence(evidencePath, state);
}

async function verifySdkSnapshotBoundary(runtime: Runtime): Promise<void> {
  const expectedRouter = runtime.sdk.public.deployment.manifest.addresses.router;
  const manifest = runtime.manifestInput;
  const mutableAddresses = manifest.addresses as { router: Address };
  mutableAddresses.router = "0x0000000000000000000000000000000000000001";
  assert(runtime.sdk.public.deployment.manifest.addresses.router === expectedRouter, "verified deployment must snapshot caller-owned manifest data");
  assert(Object.isFrozen(runtime.sdk.public.deployment.manifest) && Object.isFrozen(runtime.sdk.public.deployment.manifest.addresses), "verified deployment identity must be immutable");
  mutableAddresses.router = expectedRouter;

  const approval = await runtime.sdk.public.getApproval({ kind: "attack", maxMockUSD: 1n }, runtime.wallets.A.address);
  assert(approval.spenderAddress.toLowerCase() === expectedRouter.toLowerCase(), "unlimited attack approval spender must come from the verified deployment snapshot");

  const invalidReceiptManifest = {
    ...runtime.manifestInput,
    deployedAtBlock: runtime.sdk.public.deployment.manifest.deployedAtBlock + 1,
    addresses: { ...runtime.sdk.public.deployment.manifest.addresses },
  } as DeploymentManifest;
  let rejected = false;
  try {
    await verifyDeployment(runtime.client, invalidReceiptManifest);
  } catch {
    rejected = true;
  }
  assert(rejected, "SDK must reject a deployment receipt/block mismatch before producing a verified identity");
}

async function verifyEip1193SelectionGuard(runtime: Runtime): Promise<void> {
  const accountA = runtime.wallets.A.address;
  const accountB = runtime.wallets.B.address;
  const chain = runtime.sdk.public.deployment.chain;

  async function expectNoWrite(accountsForRead: (read: number) => Address[]): Promise<void> {
    let accountRead = 0;
    let sendCount = 0;
    const provider = {
      async request({ method }: { method: string }) {
        if (method === "eth_chainId") return `0x${runtime.chainId.toString(16)}`;
        if (method === "eth_accounts") return accountsForRead(accountRead++);
        if (method === "eth_sendTransaction" || method === "eth_sendRawTransaction") {
          sendCount++;
          return `0x${"1".repeat(64)}`;
        }
        throw new Error(`Unexpected provider method in account-order regression: ${method}`);
      },
    } as unknown as EIP1193Provider;
    const walletClient = createWalletClient({ account: accountA, chain, transport: custom(provider) });
    const testSdk = runtime.sdk.public.withWallet(walletClient);
    let rejected = false;
    try {
      await testSdk.approve({ kind: "enroll" });
    } catch (error) {
      rejected = error instanceof BossPoolSdkError && error.code === "WALLET_ACCOUNT_CHANGED";
    }
    assert(rejected, "JSON-RPC account-order change must produce a typed account mismatch");
    assert(sendCount === 0, "JSON-RPC account-order mismatch reached transaction submission");
  }

  await expectNoWrite(() => [accountB, accountA]);
  await expectNoWrite((read) => read === 0 ? [accountA, accountB] : [accountB, accountA]);
}

async function assertFaucetReceiptCannotVerifyDeployment(
  runtime: Runtime,
  faucetHash: Hex,
  receipt: TransactionReceipt,
): Promise<void> {
  assert(receipt.status === "success" && receipt.contractAddress === null, "faucet boundary fixture must be a successful non-creation receipt");
  const unrelatedManifest = {
    ...runtime.manifestInput,
    deploymentTxHash: faucetHash,
    deployedAtBlock: Number(receipt.blockNumber),
    addresses: { ...runtime.manifestInput.addresses },
  } as DeploymentManifest;
  let rejected = false;
  try {
    await verifyDeployment(runtime.client, unrelatedManifest);
  } catch {
    rejected = true;
  }
  assert(rejected, "SDK must reject an unrelated successful faucet receipt whose contractAddress is null");
}

async function runSdkAttack(
  runtime: Runtime,
  state: ExerciseState,
  evidencePath: string,
  attack: { player: ExerciseWallet; maxUSD: bigint; stage: number; label: string },
  quote: AttackQuote,
  expectedStageSold: readonly bigint[],
  priorRefills: number,
  initial: Awaited<ReturnType<typeof readSnapshot>>,
) {
  state.currentStep = attack.label;
  const before = await readSnapshot(runtime);
  assert(before.status === 1 && before.currentStage === attack.stage, `${attack.label}: round/stage changed before the quote-bound attack`);
  const playerBeforeUSD = attack.player.address === runtime.wallets.A.address ? before.mockUSDA : before.mockUSDB;
  const playerBeforeHP = attack.player.address === runtime.wallets.A.address ? before.bossHPA : before.bossHPB;
  const playerBeforeROY = attack.player.address === runtime.wallets.A.address ? before.royA : before.royB;

  const confirmed = await submitPendingOperation(
    runtime,
    state,
    evidencePath,
    attack.player,
    attack.label,
    await attack.player.sdk.attack(quote),
  );
  const actual = confirmed.result;
  assert(actual.stage === attack.stage, `${attack.label}: typed receipt stage mismatch`);
  assert(actual.mockUSDSpent === quote.mockUSDSpent, `${attack.label}: public pre-approval quote MockUSD spend did not match execution without a pool mutation`);
  assert(actual.royBought === quote.royBought && actual.roySpent === quote.roySpent, `${attack.label}: public ROY quote did not match execution without a pool mutation`);
  assert(actual.bossHPOut === quote.bossHPOut, `${attack.label}: public BossHP quote did not match execution without a pool mutation`);
  assert(actual.mockUSDRefunded === quote.mockUSDRefunded && actual.royRefunded === quote.royRefunded, `${attack.label}: quote refunds do not match actual settlement`);
  assert(actual.mockUSDSpent > 0n && actual.mockUSDSpent <= attack.maxUSD, `${attack.label}: MockUSD spend is outside its cap`);
  assert(actual.royBought > 0n && actual.roySpent > 0n && actual.roySpent <= actual.royBought, `${attack.label}: two-hop ROY accounting is invalid`);
  assert(actual.bossHPOut >= quote.minBossHPOut && actual.bossHPOut > 0n, `${attack.label}: output missed the floor the player accepted`);
  assert(actual.events.some((event) => event.eventName === "AttackExecuted" && event.transactionHash === confirmed.hash), `${attack.label}: SDK omitted its typed Router event`);
  assert(actual.events.some((event) => event.eventName === "AttackRecorded"), `${attack.label}: SDK omitted its typed Hook damage event`);

  const after = await readSnapshot(runtime);
  const playerAfterUSD = attack.player.address === runtime.wallets.A.address ? after.mockUSDA : after.mockUSDB;
  const playerAfterHP = attack.player.address === runtime.wallets.A.address ? after.bossHPA : after.bossHPB;
  const playerAfterROY = attack.player.address === runtime.wallets.A.address ? after.royA : after.royB;
  assert(playerBeforeUSD - playerAfterUSD === actual.mockUSDSpent, `${attack.label}: actual MockUSD balance delta mismatch`);
  assert(playerAfterROY - playerBeforeROY === actual.royRefunded, `${attack.label}: actual player ROY refund delta mismatch`);
  assert(playerAfterHP - playerBeforeHP === actual.bossHPOut, `${attack.label}: player did not receive the full BossHP output`);
  assert(after.bossHPTotalSupply === initial.bossHPTotalSupply, `${attack.label}: BossHP was minted or burned`);
  assert(after.royTotalSupply === initial.royTotalSupply, `${attack.label}: ROY was minted or burned`);
  assert(after.bossHPCustody === after.bossHPTotalSupply, `${attack.label}: BossHP custody failed to reconcile`);

  const updatedStageSold = [...expectedStageSold];
  updatedStageSold[attack.stage] += actual.bossHPOut;
  assert(after.stageSold.every((value, index) => value === updatedStageSold[index]), `${attack.label}: stageSold does not match actual outputs`);
  for (let index = 0; index <= after.currentStage; index++) {
    if (after.status === 1 && index === after.currentStage) continue;
    assert(after.stageSold[index] <= after.stageCapacity[index], `${attack.label}: stage ${index} exceeded capacity`);
    assert(after.roundingDust[index] === after.stageCapacity[index] - after.stageSold[index], `${attack.label}: stage ${index} dust does not reconcile`);
  }

  const hasEvent = (name: string) => actual.events.some((event) => event.eventName === name);
  if (quote.stageCleared) {
    const clear = actual.events.find((event) => event.eventName === "StageCleared");
    assert(clear, `${attack.label}: quote predicted a stage clear but the receipt lacked StageCleared`);
    if (clear.eventName !== "StageCleared") throw new Error(`${attack.label}: stage clear event type mismatch`);
    assert(clear.args.stage === attack.stage, `${attack.label}: clear event identifies another stage`);
    assert(clear.args.sold === after.stageSold[attack.stage], `${attack.label}: clear event sold amount disagrees with the stage counter`);
    assert(clear.args.capacity === after.stageCapacity[attack.stage], `${attack.label}: clear event capacity disagrees with the stage configuration`);
    assert(clear.args.roundingDust === after.roundingDust[attack.stage], `${attack.label}: clear event dust disagrees with recorded dust`);
    assert(clear.args.sold + clear.args.roundingDust === clear.args.capacity, `${attack.label}: sold amount plus dust does not reconcile to the stage capacity`);
    if (quote.bossDefeated) {
      assert(hasEvent("BossDefeated") && after.status === 3 && after.currentStage === 2, "final quote predicted defeat but the confirmed result did not");
      const finalEligibleHP = after.stageSold.reduce((sum, amount) => sum + amount, 0n);
      assert(after.finalEligibleHP === finalEligibleHP && finalEligibleHP > 0n, "final claim denominator must equal actual HP sold outputs");
      assert(after.stageSold.every((value) => value > 0n), "all three stages must have positive actual damage");
      assert(priorRefills === 2, "the complete fight must contain exactly two reserve refills");
    } else {
      assert(hasEvent("StageRefilled") && hasEvent("StageActivated"), `${attack.label}: nonfinal clear omitted refill or activation events`);
      assert(after.status === 1 && after.currentStage === attack.stage + 1, `${attack.label}: round did not activate the next zero-based stage`);
      assert(after.stageSold[attack.stage + 1] === 0n, `${attack.label}: clearing attack spilled into the next stage`);
    }
  } else {
    assert(!hasEvent("StageCleared") && !hasEvent("StageRefilled") && !hasEvent("BossDefeated"), `${attack.label}: quote predicted a partial hit but receipt included transition events`);
    assert(after.status === 1 && after.currentStage === attack.stage, `${attack.label}: partial hit must remain in its original stage`);
  }
  assert(quote.nextStage === after.currentStage, `${attack.label}: quote nextStage differs from the confirmed round state`);

  checkpoint(state, `attack-${attack.stage}-${attack.player.name}`, after, {
    quoteBlock: quote.quotedBlock.toString(),
    maxMockUSD: quote.maxMockUSD.toString(),
    minRoyOut: quote.minRoyOut.toString(),
    minBossHPOut: quote.minBossHPOut.toString(),
    quotedMockUSDSpent: quote.mockUSDSpent.toString(),
    quotedRoyBought: quote.royBought.toString(),
    quotedRoySpent: quote.roySpent.toString(),
    quotedBossHPOut: quote.bossHPOut.toString(),
    quoteStageCleared: quote.stageCleared,
    quoteBossDefeated: quote.bossDefeated,
    actualMockUSDSpent: actual.mockUSDSpent.toString(),
    actualRoyBought: actual.royBought.toString(),
    actualRoySpent: actual.roySpent.toString(),
    actualMockUSDRefunded: actual.mockUSDRefunded.toString(),
    actualRoyRefunded: actual.royRefunded.toString(),
    actualBossHPOut: actual.bossHPOut.toString(),
    attackEventId: eventIdentity(actual.events.find((event) => event.eventName === "AttackExecuted")),
    transitionEventIds: actual.events
      .filter((event) => ["StageCleared", "StageRefilled", "StageActivated", "BossDefeated"].includes(event.eventName))
      .map((event) => `${event.transactionHash}:${event.logIndex}`),
  });
  await saveEvidence(evidencePath, state);
  return {
    expectedStageSold: updatedStageSold,
    priorRefills: priorRefills + (quote.stageCleared && !quote.bossDefeated ? 1 : 0),
  };
}

async function claim(
  runtime: Runtime,
  state: ExerciseState,
  evidencePath: string,
  player: ExerciseWallet,
  hpAmount: bigint,
  label: string,
) {
  const before = await readSnapshot(runtime);
  const preview = await player.sdk.previewReward(hpAmount, player.address);
  assert(preview.claimable && preview.payout > 0n, `${label} would pay zero MockUSD`);
  assert(preview.payout === before.originalPrize * hpAmount / before.finalEligibleHP, `${label} SDK preview changed the frozen reward formula`);
  const approval = await player.sdk.approve({ kind: "claimReward", hpAmount });
  if ("request" in approval) {
    await submitPendingOperation(runtime, state, evidencePath, player, `approve Hook for ${label}`, approval);
  }
  const confirmed = await submitPendingOperation(runtime, state, evidencePath, player, label, await player.sdk.claimReward(hpAmount));
  assert(confirmed.result.hpAmount === hpAmount && confirmed.result.payout === preview.payout, `${label} confirmed claim differs from its public reward preview`);
  assert(confirmed.result.events.some((event) => event.eventName === "RewardClaimed" && event.transactionHash === confirmed.hash), `${label} SDK result omitted typed RewardClaimed log`);

  const after = await readSnapshot(runtime);
  const playerBeforeUSD = player.address === runtime.wallets.A.address ? before.mockUSDA : before.mockUSDB;
  const playerAfterUSD = player.address === runtime.wallets.A.address ? after.mockUSDA : after.mockUSDB;
  const playerBeforeHP = player.address === runtime.wallets.A.address ? before.bossHPA : before.bossHPB;
  const playerAfterHP = player.address === runtime.wallets.A.address ? after.bossHPA : after.bossHPB;
  assert(playerAfterUSD - playerBeforeUSD === preview.payout, `${label} MockUSD balance delta mismatch`);
  assert(playerBeforeHP - playerAfterHP === hpAmount, `${label} did not surrender the requested HP`);
  assert(after.bossHPInHook - before.bossHPInHook === hpAmount, `${label} HP did not remain in Hook custody`);
  assert(after.redeemedHP - before.redeemedHP === hpAmount, `${label} redeemedHP ledger mismatch`);
  assert(after.paidPrize - before.paidPrize === preview.payout, `${label} paidPrize ledger mismatch`);
}

async function submitPendingOperation<T>(
  runtime: Runtime,
  state: ExerciseState,
  evidencePath: string,
  player: ExerciseWallet,
  step: string,
  pending: PendingOperation<T>,
): Promise<{ result: T; receipt: TransactionReceipt; hash: Hex }> {
  state.currentStep = step;
  const transaction: ExerciseState["transactions"][number] = {
    step,
    from: player.address,
    hash: pending.hash,
    request: pending.request,
    status: "submitted",
  };
  state.transactions.push(transaction);
  await saveEvidence(evidencePath, state);
  let waited = await pending.wait();
  while (waited.status === "unresolved") {
    await new Promise((resolve) => setTimeout(resolve, 500));
    waited = await pending.wait();
  }
  if (!sameAddress(waited.receipt.from, player.address)) throw new Error(`${step} SDK receipt sender did not match player ${player.name}.`);
  transaction.status = "success";
  transaction.confirmedHash = waited.hash;
  transaction.blockNumber = waited.receipt.blockNumber.toString();
  transaction.gasUsed = waited.receipt.gasUsed.toString();
  await saveEvidence(evidencePath, state);
  return { result: waited.result, receipt: waited.receipt, hash: waited.hash };
}

async function expectRequote(
  run: () => Promise<unknown>,
  expectedReason: RequoteRequiredError["reason"],
  description: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assert(error instanceof RequoteRequiredError, `${description}: expected a typed requote result, got ${String(error)}`);
    assert(error.reason === expectedReason, `${description}: expected ${expectedReason}, got ${error.reason}`);
    return;
  }
  throw new Error(`${description}: stale quote was unexpectedly accepted`);
}

async function assertQuoteDidNotPersist(
  runtime: Runtime,
  before: Awaited<ReturnType<typeof readSnapshot>>,
  label: string,
): Promise<void> {
  const after = await readSnapshot(runtime);
  assertSnapshotUnchanged(before, after, label);
}

function assertSnapshotUnchanged(
  before: Awaited<ReturnType<typeof readSnapshot>>,
  after: Awaited<ReturnType<typeof readSnapshot>>,
  label: string,
): void {
  assert(before.status === after.status && before.currentStage === after.currentStage, `${label}: round state changed`);
  assert(before.currentPrice === after.currentPrice, `${label}: current pool price changed`);
  assert(before.stageSold.every((value, index) => value === after.stageSold[index]), `${label}: stage damage changed`);
  assert(before.stageCapacity.every((value, index) => value === after.stageCapacity[index]), `${label}: stage capacity changed`);
  assert(before.finalEligibleHP === after.finalEligibleHP && before.redeemedHP === after.redeemedHP && before.paidPrize === after.paidPrize, `${label}: reward accounting changed`);
  assert(before.mockUSDInHook === after.mockUSDInHook && before.bossHPCustody === after.bossHPCustody, `${label}: contract token balances changed`);
  assert(before.mockUSDA === after.mockUSDA && before.mockUSDB === after.mockUSDB, `${label}: player MockUSD changed`);
  assert(before.royA === after.royA && before.royB === after.royB, `${label}: player ROY changed`);
  assert(before.bossHPA === after.bossHPA && before.bossHPB === after.bossHPB, `${label}: player BossHP changed`);
}

function eventIdentity(event: { transactionHash: Hex; logIndex: number } | undefined): string {
  if (!event) throw new Error("SDK did not return the AttackExecuted event identity.");
  return `${event.transactionHash}:${event.logIndex}`;
}

async function readSnapshot(runtime: Runtime) {
  const blockNumber = await runtime.client.getBlockNumber({ cacheTime: 0 });
  return readSnapshotAtBlock(runtime, blockNumber);
}

async function readSnapshotAtBlock(runtime: Runtime, blockNumber: bigint, retry = 0) {
  try {
    return await readSnapshotOnce(runtime, blockNumber);
  } catch (error) {
    if (retry >= 3 || !isUnsupportedBlockError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 500));
    return readSnapshotAtBlock(runtime, blockNumber, retry + 1);
  }
}

async function readSnapshotOnce(runtime: Runtime, blockNumber: bigint) {
  const { addresses, client, wallets } = runtime;
  const read = { blockNumber };
  const [
    status,
    currentStage,
    currentPrice,
    sold0,
    sold1,
    sold2,
    capacity0,
    capacity1,
    capacity2,
    dust0,
    dust1,
    dust2,
    finalEligibleHP,
    redeemedHP,
    paidPrize,
    originalPrize,
    enrollmentFee,
    mockUSDInHook,
    mockUSDTotalSupply,
    royTotalSupply,
    bossHPTotalSupply,
    mockUSDDecimals,
    royDecimals,
    bossHPDecimals,
    mockUSDA,
    mockUSDB,
    royA,
    royB,
    bossHPA,
    bossHPB,
    bossHPInHook,
    bossHPInRouter,
    bossHPInPoolManager,
    enrolledA,
    enrolledB,
    victoryClaimedA,
    victoryClaimedB,
  ] = await Promise.all([
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "status", ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "currentStage", ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "lastSqrtPriceX96", ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "stageSold", args: [0], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "stageSold", args: [1], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "stageSold", args: [2], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "stageCapacity", args: [0], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "stageCapacity", args: [1], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "stageCapacity", args: [2], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "roundingDust", args: [0], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "roundingDust", args: [1], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "roundingDust", args: [2], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "finalEligibleHP", ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "redeemedHP", ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "paidPrize", ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "originalPrize", ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "ENROLLMENT_FEE", ...read }),
    client.readContract({ address: addresses.mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [addresses.hook], ...read }),
    client.readContract({ address: addresses.mockUSD, abi: mockUsdAbi, functionName: "totalSupply", ...read }),
    client.readContract({ address: addresses.roy, abi: royTokenAbi, functionName: "totalSupply", ...read }),
    client.readContract({ address: addresses.bossHP, abi: bossHpAbi, functionName: "totalSupply", ...read }),
    client.readContract({ address: addresses.mockUSD, abi: mockUsdAbi, functionName: "decimals", ...read }),
    client.readContract({ address: addresses.roy, abi: royTokenAbi, functionName: "decimals", ...read }),
    client.readContract({ address: addresses.bossHP, abi: bossHpAbi, functionName: "decimals", ...read }),
    client.readContract({ address: addresses.mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [wallets.A.address], ...read }),
    client.readContract({ address: addresses.mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [wallets.B.address], ...read }),
    client.readContract({ address: addresses.roy, abi: royTokenAbi, functionName: "balanceOf", args: [wallets.A.address], ...read }),
    client.readContract({ address: addresses.roy, abi: royTokenAbi, functionName: "balanceOf", args: [wallets.B.address], ...read }),
    client.readContract({ address: addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [wallets.A.address], ...read }),
    client.readContract({ address: addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [wallets.B.address], ...read }),
    client.readContract({ address: addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [addresses.hook], ...read }),
    client.readContract({ address: addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [addresses.router], ...read }),
    client.readContract({ address: addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [addresses.poolManager], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "enrolled", args: [wallets.A.address], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "enrolled", args: [wallets.B.address], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "victoryClaimed", args: [wallets.A.address], ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "victoryClaimed", args: [wallets.B.address], ...read }),
  ]);
  const stageSold = [sold0, sold1, sold2];
  const stageCapacity = [capacity0, capacity1, capacity2];
  const roundingDust = [dust0, dust1, dust2];
  return {
    blockNumber,
    status,
    currentStage,
    currentPrice,
    stageSold,
    stageCapacity,
    roundingDust,
    finalEligibleHP,
    redeemedHP,
    paidPrize,
    originalPrize,
    enrollmentFee,
    mockUSDInHook,
    mockUSDTotalSupply,
    royTotalSupply,
    bossHPTotalSupply,
    mockUSDDecimals,
    royDecimals,
    bossHPDecimals,
    mockUSDA,
    mockUSDB,
    royA,
    royB,
    bossHPA,
    bossHPB,
    bossHPInHook,
    bossHPInRouter,
    bossHPInPoolManager,
    bossHPCustody: bossHPInHook + bossHPInRouter + bossHPInPoolManager + bossHPA + bossHPB,
    enrolledA,
    enrolledB,
    victoryClaimedA,
    victoryClaimedB,
  };
}

function isUnsupportedBlockError(error: unknown): boolean {
  const seen = new Set<unknown>();
  const parts: string[] = [];
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      parts.push(current.message);
      const details = current as Error & { shortMessage?: unknown; details?: unknown; cause?: unknown };
      if (typeof details.shortMessage === "string") parts.push(details.shortMessage);
      if (typeof details.details === "string") parts.push(details.details);
      current = details.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return /unsupported block number/i.test(parts.join(" "));
}

function checkpoint(
  state: ExerciseState,
  name: string,
  snapshot: Awaited<ReturnType<typeof readSnapshot>>,
  extra: Record<string, string | number | boolean | string[]> = {},
) {
  state.checkpoints.push({
    name,
    blockNumber: snapshot.blockNumber.toString(),
    status: snapshot.status,
    currentStage: snapshot.currentStage,
    stageSold: snapshot.stageSold.map(String),
    stageCapacity: snapshot.stageCapacity.map(String),
    roundingDust: snapshot.roundingDust.map(String),
    finalEligibleHP: snapshot.finalEligibleHP.toString(),
    redeemedHP: snapshot.redeemedHP.toString(),
    paidPrize: snapshot.paidPrize.toString(),
    originalPrize: snapshot.originalPrize.toString(),
    mockUSDInHook: snapshot.mockUSDInHook.toString(),
    mockUSDTotalSupply: snapshot.mockUSDTotalSupply.toString(),
    royTotalSupply: snapshot.royTotalSupply.toString(),
    bossHPTotalSupply: snapshot.bossHPTotalSupply.toString(),
    mockUSDA: snapshot.mockUSDA.toString(),
    mockUSDB: snapshot.mockUSDB.toString(),
    royA: snapshot.royA.toString(),
    royB: snapshot.royB.toString(),
    bossHPA: snapshot.bossHPA.toString(),
    bossHPB: snapshot.bossHPB.toString(),
    bossHPInHook: snapshot.bossHPInHook.toString(),
    bossHPInRouter: snapshot.bossHPInRouter.toString(),
    bossHPInPoolManager: snapshot.bossHPInPoolManager.toString(),
    bossHPCustody: snapshot.bossHPCustody.toString(),
    ...extra,
  });
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function redactUrls(message: string): string {
  return message.replace(/https?:\/\/[^\s"']+/g, "[RPC URL redacted]");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Boss Pool exercise failed.");
  process.exitCode = 1;
});
