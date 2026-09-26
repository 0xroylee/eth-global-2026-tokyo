import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createWalletClient,
  decodeEventLog,
  defineChain,
  http,
  maxUint256,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  bossCollectiblesAbi,
  bossHpAbi,
  bossPoolHookAbi,
  bossRouterAbi,
  mockUsdAbi,
  royTokenAbi,
  createLocalPublicClient,
  DEFAULT_LOCAL_RPC_URL,
  isLocalRpcUrl,
  LOCAL_CHAIN_ID,
  parseLocalDeployment,
  verifyLocalDeployment,
} from "@boss-pool/chain";
import {
  assertCancunTransientStorage,
  assertBaseSepoliaChain,
  BASE_SEPOLIA_CHAIN_ID,
  loadTestnetConfig,
  parseDeploymentSummary,
  sanitizeSecrets,
  verifyDeploymentOnChain,
} from "./testnet-common";

const root = process.cwd();
const localManifestDefault = path.join(root, "apps/web/public/deployments/local.json");
const evidenceRoot = path.join(root, ".scratch/boss-pool-exercise");
const localPlayers = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
] as const satisfies readonly Address[];
const requiredWalletUSD = 3_000_000_000n;
const prizeFallbackSeconds = 300n;
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
  client: WalletClient<Transport, Chain, Account>;
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
    status: "submitted" | "success" | "reverted";
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
  await verifyLocalDeployment(manifest, client);
  const chain = localChain(rpcUrl);
  const transport = http(rpcUrl, { retryCount: 0, timeout: 10_000 });
  const wallets = {
    A: makeWallet("A", localPlayers[0], createWalletClient({ account: localPlayers[0], chain, transport })),
    B: makeWallet("B", localPlayers[1], createWalletClient({ account: localPlayers[1], chain, transport })),
  };
  return {
    network: "local",
    chainId,
    client,
    wallets,
    addresses: manifest.addresses,
    deploymentTxHash: manifest.deploymentTxHash,
    deploymentBlock: BigInt(manifest.deployedAtBlock),
    sanitize: redactUrls,
  };
}

async function testnetRuntime(onConfig: (config: ReturnType<typeof loadTestnetConfig>) => void): Promise<Runtime> {
  const config = loadTestnetConfig();
  onConfig(config);
  await assertBaseSepoliaChain(config.client);
  await assertCancunTransientStorage(config.client);
  const manifestPath = path.join(root, "apps/web/public/deployments/base-sepolia.json");
  const raw = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  if (
    raw.schemaVersion !== 1 || raw.network !== "base-sepolia" ||
    raw.chainId !== BASE_SEPOLIA_CHAIN_ID || typeof raw.deploymentTxHash !== "string" ||
    typeof raw.deployedAtBlock !== "number" || !Number.isSafeInteger(raw.deployedAtBlock) || raw.deployedAtBlock < 0
  ) throw new Error("The testnet manifest is missing its verified chain and deployment receipt metadata.");
  const summary = parseDeploymentSummary(`BOSS_POOL_DEPLOYMENT_JSON=${JSON.stringify(raw)}`);
  if (summary.deployer.toLowerCase() !== config.deployerAddress.toLowerCase()) {
    throw new Error("TESTNET_DEPLOYER_PRIVATE_KEY does not match the manifest deployer.");
  }
  const deploymentTxHash = raw.deploymentTxHash as Hex;
  const deploymentBlockFromManifest = BigInt(raw.deployedAtBlock);
  await verifyDeploymentOnChain(config.client, summary, deploymentTxHash, deploymentBlockFromManifest);

  const chain = baseSepoliaChain(config.rpcUrl);
  const transport = http(config.rpcUrl, { retryCount: 0, timeout: 15_000 });
  const accountA = privateKeyToAccount(config.deployerKey);
  const accountB = privateKeyToAccount(config.playerBKey);
  return {
    network: "testnet",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    client: config.client,
    wallets: {
      A: makeWallet("A", accountA.address, createWalletClient({ account: accountA, chain, transport })),
      B: makeWallet("B", accountB.address, createWalletClient({ account: accountB, chain, transport })),
    },
    addresses: summary.addresses,
    deploymentTxHash,
    deploymentBlock: deploymentBlockFromManifest,
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

function baseSepoliaChain(rpcUrl: string): Chain {
  return defineChain({
    id: BASE_SEPOLIA_CHAIN_ID,
    name: "Base Sepolia",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

function makeWallet(
  name: "A" | "B",
  address: Address,
  client: WalletClient<Transport, Chain, Account>,
): ExerciseWallet {
  return { name, address, client };
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
  state.currentStep = "verify active round and token configuration";
  const initial = await readSnapshot(runtime);
  assert(initial.status === 1 && initial.currentStage === 0, "round must be Active at zero-based stage 0");
  assert(initial.stageSold.every((sold) => sold === 0n), "all stage counters must start at zero");
  assert(initial.finalEligibleHP === 0n && initial.redeemedHP === 0n, "reward accounting must start empty");
  assert(initial.originalPrize > 0n && initial.mockUSDInHook >= initial.originalPrize, "Hook must custody the full prize");
  assert(initial.bossHPTotalSupply === 2_000n * 10n ** 18n, "BossHP fixture supply must be 2,000 tokens");
  assert(initial.mockUSDDecimals === 6 && initial.royDecimals === 18 && initial.bossHPDecimals === 18, "token decimals changed");
  assert(initial.bossHPCustody === initial.bossHPTotalSupply, "BossHP supply must be in protocol or player custody");
  assert(initial.nextCollectibleTokenId === 1n, "the fresh round must have no NFTs");
  assert(initial.stageCapacity[0] >= 300n * 10n ** 18n && initial.stageCapacity[0] <= 300n * 10n ** 18n + 1n, "stage 0 capacity changed");
  assert(initial.stageCapacity[1] >= 600n * 10n ** 18n && initial.stageCapacity[1] <= 600n * 10n ** 18n + 1n, "stage 1 capacity changed");
  assert(initial.stageCapacity[2] >= 900n * 10n ** 18n && initial.stageCapacity[2] <= 900n * 10n ** 18n + 1n, "stage 2 capacity changed");
  checkpoint(state, "active-round", initial);
  await saveEvidence(evidencePath, state);

  state.currentStep = "fund players with MockUSD faucet tokens";
  const mockUSDTotalSupplyBeforeFaucet = initial.mockUSDTotalSupply;
  for (const player of players) {
    const balance = await client.readContract({
      address: addresses.mockUSD,
      abi: mockUsdAbi,
      functionName: "balanceOf",
      args: [player.address],
    });
    if (balance < requiredWalletUSD) {
      await sendAndConfirm(
        runtime,
        state,
        evidencePath,
        player,
        `faucet MockUSD to player ${player.name}`,
        () => player.client.writeContract({
          address: addresses.mockUSD,
          abi: mockUsdAbi,
          functionName: "faucet",
          args: [player.address, requiredWalletUSD - balance],
        }),
      );
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

  for (const player of players) {
    await approveIfNeeded(runtime, state, evidencePath, player, addresses.mockUSD, mockUsdAbi, addresses.router, maxUint256, `approve Router attack spend for player ${player.name}`);
  }

  const attackPlan = [
    { player: wallets.A, maxUSD: partialAttackUSD, stage: 0, label: "partial stage 0 attack" },
    { player: wallets.B, maxUSD: clearingAttackUSD, stage: 0, label: "clear stage 0" },
    { player: wallets.A, maxUSD: clearingAttackUSD, stage: 1, label: "clear stage 1" },
    { player: wallets.B, maxUSD: clearingAttackUSD, stage: 2, label: "clear stage 2" },
  ] as const;
  let priorRefills = 0;
  let expectedStageSold = [0n, 0n, 0n];
  for (const attack of attackPlan) {
    state.currentStep = attack.label;
    const before = await readSnapshot(runtime);
    assert(before.status === 1, `${attack.label}: round is no longer Active`);
    assert(before.currentStage === attack.stage, `${attack.label}: zero-based stage changed unexpectedly`);
    const playerBeforeUSD = attack.player.address === wallets.A.address ? before.mockUSDA : before.mockUSDB;
    const playerBeforeHP = attack.player.address === wallets.A.address ? before.bossHPA : before.bossHPB;
    const playerBeforeROY = attack.player.address === wallets.A.address ? before.royA : before.royB;
    const call = await simulateAttack(runtime, attack.player, attack.maxUSD, attack.stage);
    await sendAndConfirm(
      runtime,
      state,
      evidencePath,
      attack.player,
      attack.label,
      () => attack.player.client.writeContract({
        address: addresses.router,
        abi: bossRouterAbi,
        functionName: "attackWithMockUSD",
        args: [attack.maxUSD, call.minRoyOut, call.minHPOut, attack.stage, call.deadline],
      }),
    );
    const receipt = lastReceipt(state);
    const executed = eventArgs(receipt, addresses.router, bossRouterAbi, "AttackExecuted");
    assert(sameAddress(asAddress(executed.player), attack.player.address), `${attack.label}: router emitted another player`);
    assert(asBigInt(executed.stage) === BigInt(attack.stage), `${attack.label}: router event has wrong stage`);
    const usdSpent = asBigInt(executed.mockUSDSpent);
    const royBought = asBigInt(executed.royBought);
    const roySpent = asBigInt(executed.roySpent);
    const hpOut = asBigInt(executed.bossHPReceived);
    const mockUSDRefunded = asBigInt(executed.mockUSDRefunded);
    const royRefunded = asBigInt(executed.royRefunded);
    assert(usdSpent > 0n && usdSpent <= attack.maxUSD, `${attack.label}: MockUSD spend is outside its cap`);
    assert(royBought > 0n && roySpent > 0n && roySpent <= royBought, `${attack.label}: two-hop ROY accounting is invalid`);
    assert(mockUSDRefunded === attack.maxUSD - usdSpent, `${attack.label}: Router MockUSD refund event is wrong`);
    assert(royRefunded === royBought - roySpent, `${attack.label}: Router ROY refund event is wrong`);
    assert(hpOut >= call.minHPOut && hpOut > 0n, `${attack.label}: HP output missed its simulated minimum`);

    const after = await readSnapshot(runtime);
    const playerAfterUSD = attack.player.address === wallets.A.address ? after.mockUSDA : after.mockUSDB;
    const playerAfterHP = attack.player.address === wallets.A.address ? after.bossHPA : after.bossHPB;
    const playerAfterROY = attack.player.address === wallets.A.address ? after.royA : after.royB;
    assert(playerBeforeUSD - playerAfterUSD === usdSpent, `${attack.label}: actual MockUSD balance delta mismatch`);
    assert(playerAfterROY - playerBeforeROY === royRefunded, `${attack.label}: actual player ROY refund delta mismatch`);
    assert(playerAfterHP - playerBeforeHP === hpOut, `${attack.label}: player did not receive the full BossHP output`);
    assert(after.bossHPTotalSupply === initial.bossHPTotalSupply, `${attack.label}: BossHP was minted or burned`);
    assert(after.royTotalSupply === initial.royTotalSupply, `${attack.label}: ROY was minted or burned`);
    assert(after.bossHPCustody === after.bossHPTotalSupply, `${attack.label}: BossHP custody failed to reconcile`);

    expectedStageSold[attack.stage] += hpOut;
    assert(after.stageSold.every((value, index) => value === expectedStageSold[index]), `${attack.label}: stageSold does not match actual outputs`);
    for (let index = 0; index <= after.currentStage; index++) {
      if (after.status === 1 && index === after.currentStage) continue;
      assert(after.stageSold[index] <= after.stageCapacity[index], `${attack.label}: stage ${index} exceeded capacity`);
      assert(after.roundingDust[index] === after.stageCapacity[index] - after.stageSold[index], `${attack.label}: stage ${index} dust does not reconcile`);
    }

    const refillEvents = findEvents(receipt, addresses.router, bossRouterAbi, "StageRefilled");
    const defeatedEvents = findEvents(receipt, addresses.hook, bossPoolHookAbi, "BossDefeated");
    if (attack.label === "partial stage 0 attack") {
      assert(refillEvents.length === 0 && defeatedEvents.length === 0, "partial stage 0 attack must not refill or defeat the round");
      assert(after.status === 1 && after.currentStage === 0, "partial attack must remain at zero-based stage 0");
      assert(after.stageSold[0] > 0n && after.stageSold[1] === 0n, "partial attack must record damage only in stage 0");
    } else if (attack.stage < 2) {
      assert(refillEvents.length === 1, `${attack.label}: expected exactly one refill receipt`);
      const refill = refillEvents[0];
      assert(asBigInt(refill.clearedStage) === BigInt(attack.stage), `${attack.label}: refill cleared the wrong stage`);
      assert(asBigInt(refill.nextStage) === BigInt(attack.stage + 1), `${attack.label}: refill released the wrong next stage`);
      priorRefills++;
      assert(after.status === 1 && after.currentStage === attack.stage + 1, `${attack.label}: round did not activate the next zero-based stage`);
      assert(after.stageSold[attack.stage + 1] === 0n, `${attack.label}: clearing attack spilled into the next stage`);
    } else {
      assert(refillEvents.length === 0, "final stage must not refill or advance to stage 3");
      assert(defeatedEvents.length === 1, "final attack must emit one BossDefeated event");
      assert(after.status === 3 && after.currentStage === 2, "victory must remain Defeated at zero-based stage 2");
      const finalEligibleHP = after.stageSold.reduce((sum, amount) => sum + amount, 0n);
      assert(after.finalEligibleHP === finalEligibleHP && finalEligibleHP > 0n, "final claim denominator must equal actual HP sold outputs");
      assert(asBigInt(defeatedEvents[0].finalEligibleHP) === finalEligibleHP, "BossDefeated denominator differs from actual sold output");
      assert(after.stageSold.every((value) => value > 0n), "all three stages must have positive actual damage");
      assert(priorRefills === 2, "the complete fight must contain exactly two reserve refills");
    }
    checkpoint(state, `attack-${attack.stage}-${attack.player.name}`, after, {
      maxMockUSD: attack.maxUSD.toString(),
      minRoyOut: call.minRoyOut.toString(),
      minBossHPOut: call.minHPOut.toString(),
      simulatedMockUSDSpent: call.simulated.mockUSDSpent.toString(),
      simulatedRoyBought: call.simulated.royBought.toString(),
      simulatedRoySpent: call.simulated.roySpent.toString(),
      simulatedBossHPOut: call.simulated.bossHPOut.toString(),
      actualMockUSDSpent: usdSpent.toString(),
      actualRoyBought: royBought.toString(),
      actualRoySpent: roySpent.toString(),
      actualMockUSDRefunded: mockUSDRefunded.toString(),
      actualRoyRefunded: royRefunded.toString(),
      actualBossHPOut: hpOut.toString(),
    });
    await saveEvidence(evidencePath, state);
  }

  state.currentStep = "transfer eligible BossHP rights from player B to A";
  const beforeTransfer = await readSnapshot(runtime);
  assert(beforeTransfer.status === 3, "HP transfer requires a defeated round");
  const transferAmount = beforeTransfer.bossHPB;
  assert(transferAmount > 0n, "player B must hold BossHP earned from attacks");
  await sendAndConfirm(
    runtime,
    state,
    evidencePath,
    wallets.B,
    "transfer all player B BossHP to player A",
    () => wallets.B.client.writeContract({
      address: addresses.bossHP,
      abi: bossHpAbi,
      functionName: "transfer",
      args: [wallets.A.address, transferAmount],
    }),
  );
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
    afterClaims.mockUSDInHook === afterClaims.originalPrize - afterClaims.paidPrize,
    "Hook prize custody does not reconcile after claims",
  );
  checkpoint(state, "claims-complete", afterClaims, { remainingHP: remainingHP.toString() });
  await saveEvidence(evidencePath, state);

  assert(afterClaims.nextCollectibleTokenId === 1n, "attacks and reward claims must not mint NFTs");

  state.currentStep = "claim both optional victory NFTs";
  for (const player of players) {
    assert(await client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "hasAttacked", args: [player.address] }), `player ${player.name} has no attack record`);
    await sendAndConfirm(
      runtime,
      state,
      evidencePath,
      player,
      `claim victory NFT for player ${player.name}`,
      () => player.client.writeContract({
        address: addresses.hook,
        abi: bossPoolHookAbi,
        functionName: "claimVictoryNFT",
      }),
    );
    const victoryEvent = eventArgs(lastReceipt(state), addresses.hook, bossPoolHookAbi, "VictoryNFTClaimed");
    const tokenId = asBigInt(victoryEvent.tokenId);
    assert(sameAddress(asAddress(victoryEvent.player), player.address), `victory NFT event mismatch for player ${player.name}`);
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

async function approveIfNeeded(
  runtime: Runtime,
  state: ExerciseState,
  evidencePath: string,
  player: ExerciseWallet,
  token: Address,
  abi: typeof mockUsdAbi | typeof bossHpAbi,
  spender: Address,
  amount: bigint,
  label: string,
) {
  const allowance = await runtime.client.readContract({
    address: token,
    abi,
    functionName: "allowance",
    args: [player.address, spender],
  });
  if (allowance >= amount) return;
  await sendAndConfirm(runtime, state, evidencePath, player, label, () => player.client.writeContract({
    address: token,
    abi,
    functionName: "approve",
    args: [spender, amount],
  }));
}

async function simulateAttack(runtime: Runtime, player: ExerciseWallet, maxUSD: bigint, expectedStage: number) {
  const { client, addresses } = runtime;
  const [currentStage, deadline, block] = await Promise.all([
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "currentStage" }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "deadline" }),
    client.getBlock({ blockTag: "latest" }),
  ]);
  assert(currentStage === expectedStage, `stage ${expectedStage} is no longer active`);
  const desiredDeadline = block.timestamp + prizeFallbackSeconds;
  const callDeadline = desiredDeadline < deadline ? desiredDeadline : deadline - 1n;
  assert(callDeadline >= block.timestamp, "round is at or past its attack deadline");
  const exploratory = await client.simulateContract({
    address: addresses.router,
    abi: bossRouterAbi,
    functionName: "attackWithMockUSD",
    args: [maxUSD, 0n, 1n, expectedStage, callDeadline],
    account: player.address,
  });
  const quote = attackResult(exploratory.result);
  assert(quote.royBought > 0n && quote.bossHPOut > 0n, "attack simulation produced no usable output");
  const minRoyOut = minimumOutput(quote.royBought);
  const minHPOut = minimumOutput(quote.bossHPOut);
  const finalSimulation = await client.simulateContract({
    address: addresses.router,
    abi: bossRouterAbi,
    functionName: "attackWithMockUSD",
    args: [maxUSD, minRoyOut, minHPOut, expectedStage, callDeadline],
    account: player.address,
  });
  const simulated = attackResult(finalSimulation.result);
  assert(simulated.royBought >= minRoyOut && simulated.bossHPOut >= minHPOut, "bounded attack simulation failed its output floor");
  return { minRoyOut, minHPOut, deadline: callDeadline, simulated };
}

async function claim(
  runtime: Runtime,
  state: ExerciseState,
  evidencePath: string,
  player: ExerciseWallet,
  hpAmount: bigint,
  label: string,
) {
  const hook = runtime.addresses.hook;
  await approveIfNeeded(runtime, state, evidencePath, player, runtime.addresses.bossHP, bossHpAbi, hook, hpAmount, `approve Hook for ${label}`);
  const simulated = await runtime.client.simulateContract({
    address: hook,
    abi: bossPoolHookAbi,
    functionName: "claimReward",
    args: [hpAmount],
    account: player.address,
  });
  const simulatedPayout = simulated.result;
  assert(simulatedPayout > 0n, `${label} would pay zero MockUSD`);
  const [mockUSDBefore, bossHPBefore, bossHPInHookBefore, redeemedHPBefore, paidPrizeBefore, finalEligibleHP, originalPrize] = await Promise.all([
    runtime.client.readContract({ address: runtime.addresses.mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [player.address] }),
    runtime.client.readContract({ address: runtime.addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [player.address] }),
    runtime.client.readContract({ address: runtime.addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [hook] }),
    runtime.client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "redeemedHP" }),
    runtime.client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "paidPrize" }),
    runtime.client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "finalEligibleHP" }),
    runtime.client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "originalPrize" }),
  ]);
  const expectedPayout = originalPrize * hpAmount / finalEligibleHP;
  assert(simulatedPayout === expectedPayout, `${label} does not match floor(originalPrize * HP / finalEligibleHP)`);
  await sendAndConfirm(runtime, state, evidencePath, player, label, () => player.client.writeContract({
    address: hook,
    abi: bossPoolHookAbi,
    functionName: "claimReward",
    args: [hpAmount],
  }));
  const claimed = eventArgs(lastReceipt(state), hook, bossPoolHookAbi, "RewardClaimed");
  assert(sameAddress(asAddress(claimed.player), player.address), `${label} event has wrong player`);
  assert(asBigInt(claimed.bossHPIn) === hpAmount, `${label} event surrendered the wrong amount of HP`);
  assert(asBigInt(claimed.mockUSDOut) === simulatedPayout, `${label} event payout differs from simulated contract output`);
  const [mockUSDAfter, bossHPAfter, bossHPInHookAfter, redeemedHPAfter, paidPrizeAfter] = await Promise.all([
    runtime.client.readContract({ address: runtime.addresses.mockUSD, abi: mockUsdAbi, functionName: "balanceOf", args: [player.address] }),
    runtime.client.readContract({ address: runtime.addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [player.address] }),
    runtime.client.readContract({ address: runtime.addresses.bossHP, abi: bossHpAbi, functionName: "balanceOf", args: [hook] }),
    runtime.client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "redeemedHP" }),
    runtime.client.readContract({ address: hook, abi: bossPoolHookAbi, functionName: "paidPrize" }),
  ]);
  assert(mockUSDAfter - mockUSDBefore === simulatedPayout, `${label} MockUSD balance delta mismatch`);
  assert(bossHPBefore - bossHPAfter === hpAmount, `${label} did not surrender the requested HP`);
  assert(bossHPInHookAfter - bossHPInHookBefore === hpAmount, `${label} HP did not remain in Hook custody`);
  assert(redeemedHPAfter - redeemedHPBefore === hpAmount, `${label} redeemedHP ledger mismatch`);
  assert(paidPrizeAfter - paidPrizeBefore === simulatedPayout, `${label} paidPrize ledger mismatch`);
}

async function sendAndConfirm(
  runtime: Runtime,
  state: ExerciseState,
  evidencePath: string,
  player: ExerciseWallet,
  step: string,
  send: () => Promise<Hex>,
): Promise<TransactionReceipt> {
  state.currentStep = step;
  const hash = await send();
  const transaction: ExerciseState["transactions"][number] = { step, from: player.address, hash, status: "submitted" };
  state.transactions.push(transaction);
  await saveEvidence(evidencePath, state);
  const receipt = await runtime.client.waitForTransactionReceipt({ hash, confirmations: 1 });
  transaction.status = receipt.status === "success" ? "success" : "reverted";
  transaction.blockNumber = receipt.blockNumber.toString();
  transaction.gasUsed = receipt.gasUsed.toString();
  await saveEvidence(evidencePath, state);
  if (receipt.status !== "success") throw new Error(`${step} transaction reverted (${hash}).`);
  if (!sameAddress(receipt.from, player.address)) throw new Error(`${step} receipt sender did not match player ${player.name}.`);
  receiptCache.set(state, receipt);
  return receipt;
}

const receiptCache = new WeakMap<ExerciseState, TransactionReceipt>();
function lastReceipt(state: ExerciseState): TransactionReceipt {
  const receipt = receiptCache.get(state);
  if (!receipt) throw new Error("The latest transaction receipt is unavailable.");
  return receipt;
}

function findEvents<const TAbi extends readonly unknown[]>(
  receipt: TransactionReceipt,
  emitter: Address,
  abi: TAbi,
  eventName: string,
): Array<Record<string, unknown>> {
  const found: Array<Record<string, unknown>> = [];
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, emitter)) continue;
    try {
      const decoded = decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics, strict: true });
      if (decoded.eventName === eventName) found.push(decoded.args as unknown as Record<string, unknown>);
    } catch {
      // Other valid logs from the same contract are not the event being checked.
    }
  }
  return found;
}

function eventArgs<const TAbi extends readonly unknown[]>(
  receipt: TransactionReceipt,
  emitter: Address,
  abi: TAbi,
  eventName: string,
): Record<string, unknown> {
  const found = findEvents(receipt, emitter, abi, eventName);
  if (found.length !== 1) throw new Error(`Expected one ${eventName} event from ${emitter}, found ${found.length}.`);
  return found[0];
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
    nextCollectibleTokenId,
    victoryClaimedA,
    victoryClaimedB,
  ] = await Promise.all([
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "status", ...read }),
    client.readContract({ address: addresses.hook, abi: bossPoolHookAbi, functionName: "currentStage", ...read }),
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
    client.readContract({ address: addresses.collectibles, abi: bossCollectiblesAbi, functionName: "nextTokenId", ...read }),
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
    stageSold,
    stageCapacity,
    roundingDust,
    finalEligibleHP,
    redeemedHP,
    paidPrize,
    originalPrize,
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
    nextCollectibleTokenId,
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

function attackResult(value: readonly [bigint, bigint, bigint, bigint]) {
  const [mockUSDSpent, royBought, roySpent, bossHPOut] = value;
  return { mockUSDSpent, royBought, roySpent, bossHPOut };
}

function minimumOutput(quote: bigint): bigint {
  return quote * 99n / 100n || 1n;
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  throw new Error("Decoded event field was not an integer.");
}

function asAddress(value: unknown): Address {
  if (typeof value === "string" && /^0x[\da-fA-F]{40}$/.test(value)) return value as Address;
  throw new Error("Decoded event field was not an address.");
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
