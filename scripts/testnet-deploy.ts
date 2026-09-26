import { mkdir, rename, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { formatEther } from "viem";
import {
  BASE_SEPOLIA_CHAIN_ID,
  TESTNET_MANIFEST_PATH,
  assertCancunTransientStorage,
  assertBaseSepoliaChain,
  assertCommittedDeploymentSources,
  loadTestnetConfig,
  parseForgeGas,
  parseDeploymentSummary,
  readRouterCreationReceipt,
  runDeploymentScript,
  redactSensitive,
  verifyDeploymentOnChain,
} from "./testnet-common";

const root = process.cwd();

async function main() {
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

  const output = await runDeploymentScript(config, true);
  const summary = parseDeploymentSummary(output);
  if (summary.deployer.toLowerCase() !== config.deployerAddress.toLowerCase()) {
    throw new Error("Forge summary sender does not match the test-only deployer signer.");
  }
  const receipt = await readRouterCreationReceipt(summary);
  if (BigInt(receipt.blockNumber) <= freshHead) {
    throw new Error("Foundry broadcast record did not contain a new Router creation receipt from this run.");
  }
  await verifyDeploymentOnChain(config.client, summary, receipt.transactionHash, receipt.blockNumber);

  const manifest = {
    ...summary,
    schemaVersion: 1,
    network: "base-sepolia",
    chainId: BASE_SEPOLIA_CHAIN_ID,
    deployedAtBlock: Number(receipt.blockNumber),
    deploymentTxHash: receipt.transactionHash,
    deploymentReceipts: receipt.receipts,
    provenance: {
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
    },
  };

  await mkdir(path.dirname(TESTNET_MANIFEST_PATH), { recursive: true });
  const temporaryPath = `${TESTNET_MANIFEST_PATH}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporaryPath, TESTNET_MANIFEST_PATH);
  console.log(`Verified Base Sepolia (${BASE_SEPOLIA_CHAIN_ID}) team deployment at block ${receipt.blockNumber}.`);
  console.log(`Router creation receipt: ${receipt.transactionHash}`);
  console.log(`Gas estimate: ${estimate.gas} units, ${formatEther(estimate.requiredWei)} testETH before buffer.`);
  console.log(`Wrote public address/config metadata to ${path.relative(root, TESTNET_MANIFEST_PATH)}; no RPC URL or signer material was written.`);
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
