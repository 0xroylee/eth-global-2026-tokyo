import { access, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { formatEther, type Hex } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  TESTNET_MANIFEST_PATH,
  assertCancunTransientStorage,
  assertBaseSepoliaChain,
  assertCommittedDeploymentSources,
  loadTestnetConfig,
  loadTestnetPublicConfig,
  parseForgeGas,
  parseDeploymentSummary,
  readRouterCreationReceipt,
  runDeploymentScript,
  redactSensitive,
  verifyDeploymentOnChain,
  type DeploymentSummary,
  type ReceiptEvidence,
} from "./testnet-common";

const root = process.cwd();
const pendingPath = path.join(root, ".scratch/deliver-code/contract-guide-testnet/pending-base-sepolia-deployment.json");
const completedPendingDir = path.join(root, ".scratch/deliver-code/contract-guide-testnet/verified-deployments");

type DeploymentProvenance = {
  classification: "TEAM_DEPLOYED_NON_PRODUCTION";
  contractSourceCommit: string;
  deploymentSourceCommit: string;
  v4CoreCommit: string;
  openZeppelinCommit: string;
  solidityVersion: string;
  evmVersion: string;
  deploymentScript: string;
  poolManager: string;
};
type DeploymentManifest = DeploymentSummary & {
  schemaVersion: 1;
  network: "base-sepolia";
  chainId: 84_532;
  deployedAtBlock: number;
  verifiedAtBlock: number;
  deploymentTxHash: Hex;
  deploymentReceipts: ReceiptEvidence[];
  provenance: DeploymentProvenance;
};
type PendingDeploymentIntent = {
  schemaVersion: 1;
  state: "broadcasting" | "summary-recorded" | "receipts-recorded";
  network: "base-sepolia";
  chainId: 84_532;
  startedAt: string;
  startingBlock: number;
  provenance: DeploymentProvenance;
  summary?: DeploymentSummary;
  deployedAtBlock?: number;
  verifiedAtBlock?: number;
  deploymentTxHash?: Hex;
  deploymentReceipts?: ReceiptEvidence[];
};

async function main() {
  const mode = process.argv[2];
  if (mode === "--verify-pending") {
    await verifyPendingDeployment();
    return;
  }
  if (mode !== undefined) throw new Error("Usage: bun scripts/testnet-deploy.ts [--verify-pending].");
  await deployTeamFixture();
}

async function deployTeamFixture(): Promise<void> {
  await refuseExistingPendingDeployment();
  const config = loadTestnetConfig();
  const frozenSourceCommit = assertCommittedDeploymentSources();
  await assertBaseSepoliaChain(config.client);
  await assertCancunTransientStorage(config.client);
  const dryRun = await runDeploymentScript(config, false);
  const estimate = parseForgeGas(dryRun);
  const deployBudget = estimate.requiredWei * 125n / 100n;
  const [freshHead, deployerBalance, currentGasPrice] = await Promise.all([
    assertBaseSepoliaChain(config.client),
    config.client.getBalance({ address: config.deployerAddress }),
    config.client.getGasPrice(),
  ]);
  const deployerExerciseReserve = currentGasPrice * 10_000_000n;
  if (deployerBalance < deployBudget + deployerExerciseReserve) {
    throw new Error(
      `Refusing broadcast: deployer has ${formatEther(deployerBalance)} testETH; estimate plus 25% and exercise reserve is ${formatEther(deployBudget + deployerExerciseReserve)}.`,
    );
  }

  const provenance = makeProvenance(frozenSourceCommit);
  const intent: PendingDeploymentIntent = {
    schemaVersion: 1,
    state: "broadcasting",
    network: "base-sepolia",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    startedAt: new Date().toISOString(),
    startingBlock: Number(freshHead),
    provenance,
  };
  await createExclusivePendingIntent(intent);

  // The intent is exclusive and durable before Forge can submit any transaction.
  const output = await runDeploymentScript(config, true);
  const summary = parseDeploymentSummary(output);
  if (summary.deployer.toLowerCase() !== config.deployerAddress.toLowerCase()) {
    throw new Error("Forge summary sender does not match the test-only deployer signer.");
  }
  intent.state = "summary-recorded";
  intent.summary = summary;
  await updatePendingIntent(intent);

  const receipt = await readRouterCreationReceipt(summary);
  if (receipt.blockNumber <= intent.startingBlock) {
    throw new Error("Foundry broadcast record did not contain a new Router creation receipt from this run.");
  }
  const verificationBlock = latestReceiptBlock(receipt.receipts);
  const recordedIntent: PendingDeploymentIntent = {
    ...intent,
    state: "receipts-recorded",
    deployedAtBlock: Number(receipt.blockNumber),
    verifiedAtBlock: Number(verificationBlock),
    deploymentTxHash: receipt.transactionHash,
    deploymentReceipts: receipt.receipts,
  };
  await updatePendingIntent(recordedIntent);

  const { client } = config;
  await verifyRecordedReceipts(client, receipt.receipts);
  const verifiedAtBlock = await verifyDeploymentOnChain(
    client,
    summary,
    receipt.transactionHash,
    receipt.blockNumber,
    verificationBlock,
  );
  const manifest = makePublicManifest(summary, receipt, verifiedAtBlock, provenance);
  await publishVerifiedDeployment(manifest);
  await archivePendingDeployment(recordedIntent);
  console.log(`Verified chain ${BASE_SEPOLIA_CHAIN_ID} team deployment at final setup block ${verifiedAtBlock}.`);
  console.log(`Router creation receipt: ${receipt.transactionHash}`);
  console.log(`${receipt.receipts.length} successful deployment receipts were checked on chain.`);
  console.log(`Gas estimate: ${estimate.gas} units, ${formatEther(estimate.requiredWei)} testETH before buffer.`);
  console.log(`Wrote public address/config metadata to ${path.relative(root, TESTNET_MANIFEST_PATH)}; no RPC URL or signer material was written.`);
}

async function verifyPendingDeployment(): Promise<void> {
  const { client } = loadTestnetPublicConfig();
  let intent = parsePendingIntent(await readFile(pendingPath, "utf8"));
  if (!intent.summary) {
    throw new Error(
      `Broadcast intent is incomplete. Inspect ${path.relative(root, pendingPath)} and contracts/broadcast/DeployBossPool.s.sol/84532/run-latest.json plus Base Sepolia receipts; do not rebroadcast.`,
    );
  }
  const summary = parseDeploymentSummary(`BOSS_POOL_DEPLOYMENT_JSON=${JSON.stringify(intent.summary)}`);
  let transactionHash = intent.deploymentTxHash;
  let deployedAtBlock = intent.deployedAtBlock;
  let deploymentReceipts = intent.deploymentReceipts;
  let finalBlock: bigint;
  if (intent.state !== "receipts-recorded" || !transactionHash || deployedAtBlock === undefined || !deploymentReceipts?.length) {
    const recovered = await readRouterCreationReceipt(summary);
    if (Number(recovered.blockNumber) <= intent.startingBlock) {
      throw new Error("Foundry receipts do not identify a Router creation after the exclusive broadcast intent; inspect receipts and do not rebroadcast.");
    }
    transactionHash = recovered.transactionHash;
    deployedAtBlock = Number(recovered.blockNumber);
    deploymentReceipts = recovered.receipts;
    finalBlock = latestReceiptBlock(deploymentReceipts);
    intent = {
      ...intent,
      state: "receipts-recorded",
      deployedAtBlock,
      verifiedAtBlock: Number(finalBlock),
      deploymentTxHash: transactionHash,
      deploymentReceipts,
    };
    await updatePendingIntent(intent);
  } else {
    finalBlock = latestReceiptBlock(deploymentReceipts);
    if (finalBlock !== BigInt(intent.verifiedAtBlock ?? -1)) {
      throw new Error("Pending deployment verification block does not match its final setup receipt.");
    }
  }
  if (!transactionHash || deployedAtBlock === undefined || !deploymentReceipts) {
    throw new Error("Pending deployment intent has no complete receipt identity; inspect saved Foundry receipts and do not rebroadcast.");
  }
  await verifyRecordedReceipts(client, deploymentReceipts);
  const verifiedAtBlock = await verifyDeploymentOnChain(
    client,
    summary,
    transactionHash,
    BigInt(deployedAtBlock),
    finalBlock,
  );
  const provenance = intent.provenance;
  const receipt = { transactionHash, blockNumber: BigInt(deployedAtBlock), receipts: deploymentReceipts };
  const manifest = makePublicManifest(summary, receipt, verifiedAtBlock, provenance);
  await publishVerifiedDeployment(manifest);
  await archivePendingDeployment(intent);
  console.log(`Verified pending team deployment on chain ${BASE_SEPOLIA_CHAIN_ID} at block ${verifiedAtBlock}.`);
  console.log(`Wrote public address/config metadata to ${path.relative(root, TESTNET_MANIFEST_PATH)}; no new transaction was sent.`);
}

function makeProvenance(frozenSourceCommit: string): DeploymentProvenance {
  return {
    classification: "TEAM_DEPLOYED_NON_PRODUCTION",
    contractSourceCommit: frozenSourceCommit,
    deploymentSourceCommit: frozenSourceCommit,
    v4CoreCommit: gitValue(["-C", path.join(root, "contracts/lib/v4-core"), "rev-parse", "HEAD"]),
    openZeppelinCommit: gitValue([
      "-C",
      path.join(root, "contracts/lib/v4-core/lib/openzeppelin-contracts"),
      "rev-parse",
      "HEAD",
    ]),
    solidityVersion: foundryValue("solc_version"),
    evmVersion: foundryValue("evm_version"),
    deploymentScript: "DeployBossPool.s.sol:DeployBossPool",
    poolManager: "Team deployed from the pinned v4-core source; no official Base PoolManager is claimed.",
  };
}

function makePublicManifest(
  summary: DeploymentSummary,
  receipt: { transactionHash: Hex; blockNumber: bigint; receipts: ReceiptEvidence[] },
  verifiedAtBlock: bigint,
  provenance: DeploymentProvenance,
): DeploymentManifest {
  return {
    ...summary,
    schemaVersion: 1,
    network: "base-sepolia",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    deployedAtBlock: Number(receipt.blockNumber),
    verifiedAtBlock: Number(verifiedAtBlock),
    deploymentTxHash: receipt.transactionHash,
    deploymentReceipts: receipt.receipts,
    provenance,
  };
}

function parsePendingIntent(contents: string): PendingDeploymentIntent {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error("Pending deployment evidence is malformed.");
  }
  const item = value as Record<string, unknown>;
  if (
    item.schemaVersion !== 1 || item.network !== "base-sepolia" || item.chainId !== BASE_SEPOLIA_CHAIN_ID ||
    !["broadcasting", "summary-recorded", "receipts-recorded"].includes(String(item.state)) ||
    typeof item.startedAt !== "string" || typeof item.startingBlock !== "number" || !Number.isSafeInteger(item.startingBlock) ||
    !item.provenance || typeof item.provenance !== "object" || "rpcUrl" in item || "privateKey" in item
  ) throw new Error("Pending broadcast intent is malformed; inspect its file and do not rebroadcast.");
  if (item.summary !== undefined) {
    const summary = parseDeploymentSummary(`BOSS_POOL_DEPLOYMENT_JSON=${JSON.stringify(item.summary)}`);
    if (summary.chainId !== BASE_SEPOLIA_CHAIN_ID) throw new Error("Pending Forge summary is not for Base Sepolia.");
  }
  if (item.state === "receipts-recorded") {
    if (
      typeof item.deployedAtBlock !== "number" || !Number.isSafeInteger(item.deployedAtBlock) ||
      typeof item.verifiedAtBlock !== "number" || !Number.isSafeInteger(item.verifiedAtBlock) ||
      typeof item.deploymentTxHash !== "string" || !/^0x[\da-fA-F]{64}$/.test(item.deploymentTxHash) ||
      !Array.isArray(item.deploymentReceipts) || item.deploymentReceipts.length === 0 || item.summary === undefined
    ) throw new Error("Pending receipts are incomplete; inspect Foundry run-latest.json and do not rebroadcast.");
  }
  return value as PendingDeploymentIntent;
}

function latestReceiptBlock(receipts: readonly ReceiptEvidence[]): bigint {
  if (receipts.length === 0) throw new Error("Deployment summary contains no successful receipts.");
  const block = receipts.reduce((latest, receipt) => Math.max(latest, receipt.blockNumber), 0);
  return BigInt(block);
}

async function verifyRecordedReceipts(client: Awaited<ReturnType<typeof loadTestnetPublicConfig>>["client"], evidence: readonly ReceiptEvidence[]): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const receipts = await Promise.all(evidence.map(({ transactionHash }) =>
        client.getTransactionReceipt({ hash: transactionHash }),
      ));
      for (const [index, receipt] of receipts.entries()) {
        const expected = evidence[index];
        if (
          receipt.status !== "success" || Number(receipt.blockNumber) !== expected.blockNumber ||
          (expected.gasUsed !== undefined && receipt.gasUsed.toString() !== expected.gasUsed) ||
          (expected.contractAddress !== undefined && receipt.contractAddress?.toLowerCase() !== expected.contractAddress.toLowerCase())
        ) throw new Error(`Deployment receipt ${expected.transactionHash} does not match its saved successful receipt identity.`);
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Foundry's saved deployment receipts were not all visible on Base Sepolia after bounded retries.", { cause: lastError });
}

async function createExclusivePendingIntent(intent: PendingDeploymentIntent): Promise<void> {
  await mkdir(path.dirname(pendingPath), { recursive: true });
  let handle;
  try {
    handle = await open(pendingPath, "wx", 0o600);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "EEXIST") throw new Error("Another testnet deployment intent already exists; inspect it with --verify-pending before any new broadcast.");
    throw new Error("Could not create the exclusive testnet broadcast intent; no Forge broadcast was started.");
  }
  try {
    await handle.writeFile(`${JSON.stringify(intent, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function updatePendingIntent(intent: PendingDeploymentIntent): Promise<void> {
  const temporaryPath = `${pendingPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(intent, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, pendingPath);
}

async function publishVerifiedDeployment(manifest: DeploymentManifest): Promise<void> {
  await mkdir(path.dirname(TESTNET_MANIFEST_PATH), { recursive: true });
  const temporaryPath = `${TESTNET_MANIFEST_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporaryPath, TESTNET_MANIFEST_PATH);
}

async function archivePendingDeployment(intent: PendingDeploymentIntent): Promise<void> {
  try {
    await mkdir(completedPendingDir, { recursive: true });
    const verifiedAtBlock = intent.verifiedAtBlock ?? intent.startingBlock;
    const transaction = intent.deploymentTxHash ?? "incomplete";
    const fileName = `base-sepolia-${verifiedAtBlock}-${transaction.slice(2, 10)}.json`;
    await rename(pendingPath, path.join(completedPendingDir, fileName));
  } catch {
    // The public manifest is already verified; preserving the pending file is safe and blocks accidental rebroadcast.
  }
}

async function refuseExistingPendingDeployment(): Promise<void> {
  try {
    await access(pendingPath);
  } catch {
    return;
  }
  throw new Error("A prior deployment has pending on-chain verification; use --verify-pending before any new broadcast.");
}

function gitValue(args: string[]) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function foundryValue(name: string) {
  const foundryToml = readFileSync(path.join(root, "contracts/foundry.toml"), "utf8");
  const value = foundryToml.match(new RegExp(`^${name}\\s*=\\s*"([^\"]+)"`, "m"))?.[1];
  if (!value) throw new Error(`Could not read ${name} from contracts/foundry.toml.`);
  return value;
}

main().catch((error) => {
  console.error(redactSensitive(error instanceof Error ? error.message : "Testnet deploy failed."));
  process.exitCode = 1;
});
