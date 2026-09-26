import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBossFactorySdk,
  createBossPoolSdk,
  createLocalPublicClient,
  isLocalRpcUrl,
  parseLocalDeployment,
  resolveBossDeployment,
  bossHookCreationCode,
  bossRouterCreationCode,
  verifyDeployment,
  type Address,
  type DeploymentManifest,
  type Hex,
  type BossPoolSdk,
  type FactoryLaunchResult,
  type PendingOperation,
  type VerifiedDeployment,
} from "@boss-pool/chain";
import { createWalletClient, defineChain, erc20Abi, http, keccak256, type Abi } from "viem";
import { mnemonicToAccount } from "viem/accounts";

const root = process.cwd();
const evidencePath = path.join(root, ".scratch/battle-routing/factory-routing-results.json");
const accounts = [0, 1, 2].map((addressIndex) =>
  mnemonicToAccount("test test test test test test test test test test test junk", { addressIndex }),
);
const [maker, fighterA, fighterB] = accounts;
const attackCap = 1_000_000n;
const memeAllocation = 2_000n * 10n ** 6n;

type Artifact = { abi: Abi; bytecode: string | { object: string } };
type VolumeRound = {
  encounterMode: "standalone" | "factory";
  hpToken: { address: Address; decimals: number };
  rewardToken: { address: Address; decimals: number };
  status: number;
  currentStage: number;
  stageVolume: readonly bigint[];
  stageVolumeTarget: readonly bigint[];
  totalVolume: bigint;
  volumeTargetMockUSD: bigint;
  finalEligibleHP: bigint;
  redeemedHP: bigint;
};

async function main() {
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    status: "running",
    body: {},
  };
  await mkdir(path.dirname(evidencePath), { recursive: true });

  try {
    const manifestPath = path.resolve(root, process.env.LOCAL_DEPLOYMENT_PATH ?? ".scratch/battle-routing/local.json");
    const scratch = path.resolve(root, ".scratch");
    const relativeManifest = path.relative(scratch, manifestPath);
    if (relativeManifest.startsWith(`..${path.sep}`) || path.isAbsolute(relativeManifest)) {
      throw new Error("LOCAL_DEPLOYMENT_PATH must stay under .scratch/.");
    }
    const standalone = parseLocalDeployment(JSON.parse(await readFile(manifestPath, "utf8")));
    const rpcUrl = process.env.LOCAL_RPC_URL ?? standalone.rpcUrl;
    if (!isLocalRpcUrl(rpcUrl) || rpcUrl !== standalone.rpcUrl) {
      throw new Error("LOCAL_RPC_URL must be the manifest's credential-free loopback URL.");
    }
    const client = createLocalPublicClient(rpcUrl);
    const chainId = await client.getChainId();
    if (chainId !== 31_337) throw new Error(`Refusing Factory smoke on chain ${chainId}.`);
    await verifyDeployment(client, standalone);
    const chain = defineChain({
      id: chainId,
      name: "Boss Pool Routing Smoke",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    });
    const transport = http(rpcUrl, { retryCount: 0, timeout: 15_000 });
    const makerWallet = createWalletClient({ account: maker, chain, transport });
    const fighterAWallet = createWalletClient({ account: fighterA, chain, transport });
    const fighterBWallet = createWalletClient({ account: fighterB, chain, transport });

    const factoryArtifact = await readArtifact("contracts/out/BossFactory.sol/BossFactory.json");
    const factoryDeployment = await deployArtifact(factoryArtifact, [
      standalone.addresses.poolManager,
      standalone.addresses.mockUSD,
      standalone.addresses.roy,
      keccak256(bossRouterCreationCode),
      keccak256(bossHookCreationCode),
    ], makerWallet, client);
    const factory = factoryDeployment.address;
    assert(same(standalone.deployer, maker.address), "fixture signer must match the seeded local manifest deployer");

    const sixDecimalArtifact = await readArtifact("contracts/out/BossPoolCore.t.sol/SixDecimalMeme.json");
    const sixDecimalToken = await deployArtifact(sixDecimalArtifact, [maker.address, 10_000n * 10n ** 6n], makerWallet, client);
    const factorySdk = createBossFactorySdk({ publicClient: client, factory, walletClient: makerWallet });
    const build = await factorySdk.checkFactoryBuild();
    assert(build.status === "compatible", "deployed Factory bytecode must match the SDK build");
    const sixDecimalInfo = await factorySdk.readToken(sixDecimalToken.address, maker.address);
    assert(sixDecimalInfo.decimals === 6, "SixDecimalMeme artifact must report six decimals");

    const launchBase = {
      token: sixDecimalToken.address,
      tokenAllocation: memeAllocation,
      prizeBps: 1_000,
      volumeTargetMockUSD: 6n * 10n ** 6n,
      deadline: BigInt(Math.floor(Date.now() / 1_000) + 86_400),
      maxAttackTokenPerMockUSDX128: 0n,
    } as const;
    const launches: Array<{ approvalHash: Hex | null; result: FactoryLaunchResult; acceptedRate: bigint }> = [];
    for (let index = 0; index < 2; index++) {
      const quote = await factorySdk.quoteLaunch(launchBase);
      const config = { ...launchBase, maxAttackTokenPerMockUSDX128: quote.maxRoyPerMockUSDX128 };
      const approvalHash = await factorySdk.approveToken(sixDecimalToken.address, memeAllocation);
      const launched = await factorySdk.launchBoss(config);
      launches.push({ approvalHash, result: launched, acceptedRate: config.maxAttackTokenPerMockUSDX128 });
    }
    const launchA = launches[0]!.result;
    const launchB = launches[1]!.result;
    assert(!same(launchA.bossId, launchB.bossId) && !same(launchA.hook, launchB.hook) && !same(launchA.router, launchB.router), "Factory launches must have distinct boss, Hook and Router identities");
    assert(same(launchA.token, sixDecimalToken.address) && same(launchB.token, sixDecimalToken.address), "both bosses must sell the same six-decimal MEME contract");

    const factoryReceipt = await client.getTransactionReceipt({ hash: factoryDeployment.hash });
    const routingManifest = {
      ...standalone,
      bossFactory: factory,
      bossFactoryDeployedAtBlock: Number(factoryReceipt.blockNumber),
    } as DeploymentManifest;
    const routingManifestPath = path.join(root, ".scratch/battle-routing/factory-local.json");
    await writeFile(routingManifestPath, `${JSON.stringify(routingManifest, null, 2)}\n`);
    await verifyDeployment(client, routingManifest);

    const [deploymentA, deploymentB] = await Promise.all([
      resolveBossDeployment(client, routingManifest, launchA.hook),
      resolveBossDeployment(client, routingManifest, launchB.hook),
    ]);
    assertResolved(deploymentA, launchA.hook, launchA.router, launchA.bossId, factory);
    assertResolved(deploymentB, launchB.hook, launchB.router, launchB.bossId, factory);
    assert(!same(deploymentA.hookAddress, deploymentB.hookAddress), "direct-link contexts must retain separate Hook identity");
    assert(deploymentA.hpToken?.decimals === 6 && same(deploymentA.hpToken.address, sixDecimalToken.address), "resolved Factory MEME metadata must preserve the six-decimal token");

    let unknownHookError: { name?: string; code?: string } = {};
    try {
      await resolveBossDeployment(client, routingManifest, sixDecimalToken.address);
    } catch (error) {
      unknownHookError = error as { name?: string; code?: string };
    }
    assert(unknownHookError.code === "BOSS_NOT_FOUND", "an unrelated deployed token contract must be rejected as an unknown Hook");

    const publicSdkA = createBossPoolSdk({ publicClient: client, deployment: deploymentA });
    const publicSdkB = createBossPoolSdk({ publicClient: client, deployment: deploymentB });
    const sdkA = publicSdkA.withWallet(fighterAWallet);
    const sdkB = publicSdkB.withWallet(fighterBWallet);
    const roundA0 = await publicSdkA.readRound() as VolumeRound;
    const roundB0 = await publicSdkB.readRound() as VolumeRound;
    assert(roundA0.encounterMode === "factory" && roundB0.encounterMode === "factory", "SDK snapshots must keep both selected encounter modes");
    assert(
      roundA0.hpToken.decimals === 6 && roundB0.hpToken.decimals === 6 &&
      same(roundA0.hpToken.address, sixDecimalToken.address) && same(roundB0.hpToken.address, sixDecimalToken.address),
      "SDK snapshots must read each Hook's actual six-decimal MEME metadata",
    );
    assert(roundA0.status === 1 && roundB0.status === 1, "both Factory encounters must start active");
    assert(roundA0.totalVolume === 0n && roundB0.totalVolume === 0n, "new encounters must have independent zero volume");

    const quoteA = await publicSdkA.quoteAttack({ maxMockUSD: attackCap, stage: 0 });
    const quoteB = await publicSdkB.quoteAttack({ maxMockUSD: attackCap, stage: 0 });
    assert(same(quoteA.hook, launchA.hook) && same(quoteA.router, launchA.router), "A's direct-link quote must target A's Hook and Router");
    assert(same(quoteB.hook, launchB.hook) && same(quoteB.router, launchB.router), "B's direct-link quote must target B's Hook and Router");
    const approvalA = await sdkA.getApproval({ kind: "attack", maxMockUSD: attackCap }, fighterA.address);
    const approvalB = await sdkB.getApproval({ kind: "attack", maxMockUSD: attackCap }, fighterB.address);
    assert(
      approvalA.approvalNeeded && approvalB.approvalNeeded &&
      same(approvalA.spenderAddress, launchA.router) && same(approvalB.spenderAddress, launchB.router),
      "attack approvals must be required for and target the selected boss Router",
    );

    let staleQuoteReason = "";
    try {
      await sdkB.prepareAttack(quoteA);
    } catch (error) {
      staleQuoteReason = String((error as { reason?: string }).reason ?? "");
    }
    assert(staleQuoteReason === "deployment-changed", "B must reject A's quote by encounter identity before any write");

    const transferredMeme = 123_456n;
    const transferHash = await makerWallet.writeContract({
      address: sixDecimalToken.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [fighterA.address, transferredMeme],
    });
    await client.waitForTransactionReceipt({ hash: transferHash });
    assert((await publicSdkA.readRound() as VolumeRound).totalVolume === 0n, "wallet MEME transfers must not count as Factory attack volume");
    const initialMemeBalance = await balanceOf(client, sixDecimalToken.address, fighterA.address);
    await confirmed(await sdkA.faucetMockUSD(12n * 10n ** 6n));

    const attackReceipts: Array<Record<string, string | number | boolean>> = [];
    let firstAttackRequest: ReturnType<typeof freezeRequest> | undefined;
    for (let stage = 0; stage < 3; stage++) {
      let retries = 0;
      while (true) {
        const before = await publicSdkA.readRound() as VolumeRound;
        if (before.status === 3) break;
        assert(before.currentStage === stage, `encounter A moved to unexpected stage ${before.currentStage}`);
        const quote = retries === 0 && stage === 0
          ? quoteA
          : await publicSdkA.quoteAttack({ maxMockUSD: attackCap, stage });
        const beforeStageVolume = before.stageVolume[stage];
        const beforeTotalVolume = before.totalVolume;
        const approval = await sdkA.getApproval({ kind: "attack", maxMockUSD: quote.maxMockUSD }, fighterA.address);
        assert(same(approval.spenderAddress, launchA.router), "A's quoted attack approval target changed");
        if (approval.approvalNeeded) {
          const submittedApproval = await sdkA.approve({ kind: "attack", maxMockUSD: quote.maxMockUSD });
          if ("wait" in submittedApproval) await confirmed(submittedApproval);
          else assert(!submittedApproval.approval.approvalNeeded, "SDK unexpectedly skipped a required Router approval");
        }
        const pending = await sdkA.attack(quote);
        const request = freezeRequest(pending.request);
        const result = await confirmed(pending);
        if (!firstAttackRequest) firstAttackRequest = request;
        const after = await publicSdkA.readRound() as VolumeRound;
        assert(after.stageVolume[stage] > beforeStageVolume && after.totalVolume > beforeTotalVolume, "confirmed attack must credit actual stage and encounter volume");
        attackReceipts.push({
          hash: result.hash,
          blockNumber: result.receipt.blockNumber.toString(),
          stage,
          actualMockUSDSpent: result.result.mockUSDSpent.toString(),
          memeOutput: result.result.bossHPOut.toString(),
          stageVolume: after.stageVolume[stage].toString(),
          stageTarget: after.stageVolumeTarget[stage].toString(),
          totalVolume: after.totalVolume.toString(),
          clearsStage: after.currentStage > stage || after.status === 3,
        });
        retries++;
        assert(retries <= 4, `stage ${stage} did not clear within the expected local-smoke bound`);
        if (after.currentStage > stage || after.status === 3) break;
      }
    }
    assert(firstAttackRequest, "first confirmed attack request was not saved for receipt recovery");

    const creditAfterDefeat = (await sdkA.readPlayer(fighterA.address) as { rewardCredit: bigint }).rewardCredit;
    const defeatedA = await publicSdkA.readRound() as VolumeRound;
    assert(defeatedA.status === 3 && defeatedA.totalVolume >= defeatedA.volumeTargetMockUSD, "A must win from credited Factory volume");
    assert(creditAfterDefeat > 0n, "Factory attack must create player reward credit");
    const memeBalanceAfterAttacks = await balanceOf(client, sixDecimalToken.address, fighterA.address);
    assert(memeBalanceAfterAttacks === initialMemeBalance + (await sumMemeOutput(attackReceipts)), "attack-delivered MEME must reconcile to actual attack output");
    assert(memeBalanceAfterAttacks > creditAfterDefeat, "reward credit must remain distinct from total wallet MEME holdings");

    const unearnedCreditProbe = creditAfterDefeat >= 100n ? 100n : 1n;
    const transferToNonAttacker = await makerWallet.writeContract({
      address: sixDecimalToken.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [fighterB.address, unearnedCreditProbe],
    });
    await client.waitForTransactionReceipt({ hash: transferToNonAttacker });
    const nonAttackerOnA = await publicSdkA.readPlayer(fighterB.address) as { rewardCredit: bigint; bossHPBalance: bigint };
    assert(nonAttackerOnA.bossHPBalance >= unearnedCreditProbe && nonAttackerOnA.rewardCredit === 0n, "a nonattacker must hold enough MEME without gaining this boss's credit");
    assert(defeatedA.finalEligibleHP - defeatedA.redeemedHP >= unearnedCreditProbe, "global eligible supply must not mask the per-player credit check");
    let nonAttackerClaimError = "";
    try {
      await publicSdkA.previewReward(unearnedCreditProbe, fighterB.address);
    } catch (error) {
      nonAttackerClaimError = String((error as { code?: string }).code ?? "");
    }
    assert(nonAttackerClaimError === "INSUFFICIENT_REWARD_CREDIT", "holding transferable MEME must not let another wallet claim A's reward credit");

    const creditPortion = creditAfterDefeat / 2n;
    assert(creditPortion > 0n && creditPortion < creditAfterDefeat, "Factory reward credit must support a partial claim");
    const hookAllowanceBeforeClaims = await tokenAllowance(client, sixDecimalToken.address, fighterA.address, launchA.hook);
    assert(hookAllowanceBeforeClaims === 0n, "Factory reward claims must not need a MEME approval to the Hook");
    const claimOne = await claimCredit(sdkA, client, sixDecimalToken.address, fighterA.address, launchA.hook, creditPortion);
    const playerAfterPartial = await sdkA.readPlayer(fighterA.address) as { rewardCredit: bigint };
    assert(playerAfterPartial.rewardCredit === creditAfterDefeat - creditPortion, "partial Factory claim must consume only the requested credit");
    const claimTwo = await claimCredit(sdkA, client, sixDecimalToken.address, fighterA.address, launchA.hook, playerAfterPartial.rewardCredit);
    const playerAfterFinal = await sdkA.readPlayer(fighterA.address) as { rewardCredit: bigint };
    assert(playerAfterFinal.rewardCredit === 0n, "final Factory claim must clear remaining reward credit");
    assert(await tokenAllowance(client, sixDecimalToken.address, fighterA.address, launchA.hook) === 0n, "Factory claims must leave Hook allowance at zero");
    assert(
      (await balanceOf(client, sixDecimalToken.address, fighterA.address)) === memeBalanceAfterAttacks + BigInt(claimOne.payout) + BigInt(claimTwo.payout),
      "partial and final claims must preserve purchased MEME and add prize MEME",
    );

    const reloadClient = createLocalPublicClient(rpcUrl);
    const reloadDeploymentA = await resolveBossDeployment(reloadClient, routingManifest, launchA.hook);
    assertResolved(reloadDeploymentA, launchA.hook, launchA.router, launchA.bossId, factory);
    const reverifiedOriginalManifest = await verifyDeployment(reloadClient, deploymentA.manifest);
    assert(same(reverifiedOriginalManifest.hookAddress, launchA.hook), "the original resolved manifest must re-verify after victory and claims");
    const reloadSdkA = createBossPoolSdk({ publicClient: reloadClient, deployment: reloadDeploymentA }).withWallet(fighterAWallet);
    const reloadedRoundA = await reloadSdkA.readRound() as VolumeRound;
    assert(reloadedRoundA.status === 3 && reloadedRoundA.totalVolume === defeatedA.totalVolume, "fresh-client resolution must retain the played Factory encounter state");
    const blockBeforeRecovery = await reloadClient.getBlockNumber({ cacheTime: 0 });
    const nonceBeforeRecovery = await reloadClient.getTransactionCount({ address: fighterA.address });
    const recovery = await confirmed(await reloadSdkA.resumePending(firstAttackRequest));
    const blockAfterRecovery = await reloadClient.getBlockNumber({ cacheTime: 0 });
    const nonceAfterRecovery = await reloadClient.getTransactionCount({ address: fighterA.address });
    assert(same(recovery.hash, String(attackReceipts[0].hash)), "receipt recovery must return the original attack receipt");
    assert(blockAfterRecovery === blockBeforeRecovery && nonceAfterRecovery === nonceBeforeRecovery, "receipt recovery must send no transaction");

    const finalB = await publicSdkB.readRound() as VolumeRound;
    const playerB = await sdkB.readPlayer(fighterB.address) as { rewardCredit: bigint };
    assert(finalB.status === 1 && finalB.currentStage === 0 && finalB.totalVolume === 0n, "second boss must remain untouched and active for browser checks");
    assert(playerB.rewardCredit === 0n, "A's attacks and claims must not affect B's player credit");

    const body = {
      network: {
        chainId,
        fixtureManifest: path.relative(root, manifestPath),
        routingManifest: path.relative(root, routingManifestPath),
      },
      contracts: {
        factory,
        factoryDeploymentHash: factoryDeployment.hash,
        factoryDeployedAtBlock: factoryReceipt.blockNumber.toString(),
        memeToken: sixDecimalToken.address,
        memeDecimals: sixDecimalInfo.decimals,
        unknownContractCandidate: sixDecimalToken.address,
        bosses: launches.map(({ result, acceptedRate }) => ({
          bossId: result.bossId,
          hook: result.hook,
          router: result.router,
          token: result.token,
          launchHash: result.hash,
          acceptedRate: acceptedRate.toString(),
        })),
      },
      unknownHookRejected: unknownHookError,
      directLinks: {
        A: { chainId: deploymentA.chainId, hook: deploymentA.hookAddress, router: deploymentA.manifest.addresses.router, mode: deploymentA.encounterMode },
        B: { chainId: deploymentB.chainId, hook: deploymentB.hookAddress, router: deploymentB.manifest.addresses.router, mode: deploymentB.encounterMode },
      },
      quoteAndApproval: {
        quoteAHook: quoteA.hook,
        quoteARouter: quoteA.router,
        quoteBHook: quoteB.hook,
        quoteBRouter: quoteB.router,
        approvalASpender: approvalA.spenderAddress,
        approvalBSpender: approvalB.spenderAddress,
        staleQuoteAOnB: staleQuoteReason,
      },
      attacks: attackReceipts,
      claims: [claimOne, claimTwo],
      rewardCredit: {
        initialTransferredMeme: transferredMeme.toString(),
        nonAttackerMeme: nonAttackerOnA.bossHPBalance.toString(),
        nonAttackerRewardCredit: nonAttackerOnA.rewardCredit.toString(),
        nonAttackerPreviewError: nonAttackerClaimError,
        nonAttackerProbeAmount: unearnedCreditProbe.toString(),
        walletMemeAfterAttacks: memeBalanceAfterAttacks.toString(),
        creditAfterDefeat: creditAfterDefeat.toString(),
        hookAllowanceBefore: hookAllowanceBeforeClaims.toString(),
        hookAllowanceAfter: "0",
      },
      receiptRecovery: {
        hash: recovery.hash,
        receiptBlock: recovery.receipt.blockNumber.toString(),
        blockBefore: blockBeforeRecovery.toString(),
        blockAfter: blockAfterRecovery.toString(),
        nonceBefore: nonceBeforeRecovery,
        nonceAfter: nonceAfterRecovery,
        sentTransaction: false,
        freshlyResolvedHook: reloadDeploymentA.hookAddress,
        originalManifestReverified: same(reverifiedOriginalManifest.hookAddress, launchA.hook),
      },
      reloadedBossA: {
        hook: reloadDeploymentA.hookAddress,
        status: reloadedRoundA.status,
        currentStage: reloadedRoundA.currentStage,
        totalVolume: reloadedRoundA.totalVolume.toString(),
        manifestReverified: true,
      },
      browserBoss: {
        hook: launchB.hook,
        router: launchB.router,
        status: finalB.status,
        currentStage: finalB.currentStage,
        totalVolume: finalB.totalVolume.toString(),
      },
    };
    evidence.status = "completed";
    evidence.completedAt = new Date().toISOString();
    evidence.smokeSha256 = createHash("sha256").update(await readFile(fileURLToPath(import.meta.url))).digest("hex");
    const sourceFiles = [
      "scripts/local-battle-routing-smoke.ts",
      "packages/chain/src/deployment.ts",
      "packages/chain/src/factory-sdk.ts",
      "packages/chain/src/index.ts",
      "packages/chain/src/reads.ts",
      "packages/chain/src/sdk.ts",
    ];
    evidence.sourceFileSha256 = Object.fromEntries(await Promise.all(sourceFiles.map(async (file) => [
      file,
      createHash("sha256").update(await readFile(path.join(root, file))).digest("hex"),
    ])));
    evidence.body = body;
    await writeEvidence(evidence);
    console.log("Local Factory battle-routing smoke: PASS.");
    console.log(`Factory: ${factory}; A: ${launchA.hook}; B left active: ${launchB.hook}.`);
    console.log(`Evidence: ${path.relative(root, evidencePath)}.`);
  } catch (error) {
    evidence.status = "failed";
    evidence.completedAt = new Date().toISOString();
    evidence.failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    await writeEvidence(evidence).catch(() => undefined);
    throw error;
  }
}

async function readArtifact(relativePath: string): Promise<{ abi: Abi; bytecode: Hex }> {
  const artifact = JSON.parse(await readFile(path.join(root, relativePath), "utf8")) as Artifact;
  const bytecode = typeof artifact.bytecode === "string" ? artifact.bytecode : artifact.bytecode.object;
  if (!bytecode || bytecode === "0x" || bytecode.includes("__")) throw new Error(`Compiled artifact has no deployable bytecode: ${relativePath}`);
  return { abi: artifact.abi, bytecode: bytecode as Hex };
}

async function deployArtifact(
  artifact: { abi: Abi; bytecode: Hex },
  args: readonly unknown[],
  wallet: ReturnType<typeof createWalletClient>,
  client: ReturnType<typeof createLocalPublicClient>,
) {
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode,
    args: args as never,
    account: wallet.account!,
    chain: wallet.chain!,
    type: "eip1559",
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  assert(receipt.status === "success" && receipt.contractAddress, "artifact deployment must confirm with a contract address");
  return { address: receipt.contractAddress, hash, blockNumber: receipt.blockNumber };
}

async function claimCredit(
  sdk: BossPoolSdk,
  client: ReturnType<typeof createLocalPublicClient>,
  token: Address,
  account: Address,
  hook: Address,
  amount: bigint,
) {
  const preview = await sdk.previewReward(amount, account);
  assert(preview.amountKind === "reward-credit", "Factory preview must interpret the requested amount as reward credit");
  const allowanceBefore = await tokenAllowance(client, token, account, hook);
  const nonceBefore = await client.getTransactionCount({ address: account });
  const pending = await sdk.claimReward(amount);
  const confirmedClaim = await confirmed(pending);
  const nonceAfter = await client.getTransactionCount({ address: account });
  const allowanceAfter = await tokenAllowance(client, token, account, hook);
  assert(nonceAfter === nonceBefore + 1, "Factory reward claim must be the only claim transaction; no approval was sent");
  assert(allowanceBefore === 0n && allowanceAfter === 0n, "Factory reward claim must skip MEME approval");
  assert(confirmedClaim.result.payout === preview.payout, "Factory reward payout must match its SDK preview");
  return {
    hash: confirmedClaim.hash,
    blockNumber: confirmedClaim.receipt.blockNumber.toString(),
    creditUsed: amount.toString(),
    amountKind: confirmedClaim.result.amountKind,
    rewardToken: confirmedClaim.result.rewardToken.address,
    payout: confirmedClaim.result.payout.toString(),
    previewPayout: preview.payout.toString(),
    nonceDelta: nonceAfter - nonceBefore,
  };
}

async function balanceOf(client: ReturnType<typeof createLocalPublicClient>, token: Address, account: Address) {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] });
}

async function tokenAllowance(client: ReturnType<typeof createLocalPublicClient>, token: Address, owner: Address, spender: Address) {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
}

async function confirmed<T>(operation: PendingOperation<T>) {
  const result = await operation.wait();
  if (result.status !== "confirmed") throw new Error(`Transaction ${operation.request.hash} is unresolved.`);
  return result;
}

function freezeRequest(request: PendingOperation<unknown>["request"]) {
  return Object.freeze(structuredClone(request));
}

function assertResolved(deployment: VerifiedDeployment, hook: Address, router: Address, bossId: Hex, factory: Address) {
  assert(deployment.encounterMode === "factory", "resolved route must be a Factory encounter");
  assert(same(deployment.hookAddress, hook), "resolver must retain the exact direct-link Hook");
  assert(same(deployment.manifest.addresses.hook, hook), "resolved deployment manifest Hook must match the selected link");
  assert(same(deployment.manifest.addresses.router, router), "resolved deployment manifest Router must match its launch event");
  const provenance = deployment.provenance as { factoryAddress?: Address; bossId?: Hex };
  assert(same(provenance.factoryAddress, factory) && same(provenance.bossId, bossId), "resolved link must carry the matching Factory launch identity");
}

function same(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sumMemeOutput(attacks: readonly Record<string, string | number | boolean>[]) {
  return attacks.reduce((sum, attack) => sum + BigInt(String(attack.memeOutput)), 0n);
}

async function writeEvidence(evidence: Record<string, unknown>) {
  await writeFile(evidencePath, `${JSON.stringify(evidence, (_, value) => typeof value === "bigint" ? value.toString() : value, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
