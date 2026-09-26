import { execFileSync } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createLocalPublicClient,
  DEFAULT_LOCAL_RPC_URL,
  isLocalRpcUrl,
  LOCAL_CHAIN_ID,
  parseLocalDeployment,
  verifyLocalDeployment,
  type LocalDeploymentManifest,
} from "@boss-pool/chain";

const anvilSender = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const root = process.cwd();
const contractsDir = path.join(root, "contracts");
const rpcUrl = process.env.LOCAL_RPC_URL ?? DEFAULT_LOCAL_RPC_URL;
const manifestPath = resolveManifestPath();

async function main() {
  if (!isLocalRpcUrl(rpcUrl)) throw new Error("LOCAL_RPC_URL must be a credential-free loopback HTTP URL.");

  const client = createLocalPublicClient(rpcUrl);
  let chainId: number;
  try {
    chainId = await client.getChainId();
  } catch {
    throw new Error(`Cannot reach ${rpcUrl}. Start the task-owned node with “bun run local:node”; this command does not start, reset, or stop a node.`);
  }
  if (chainId !== LOCAL_CHAIN_ID) throw new Error(`Refusing to broadcast: ${rpcUrl} is chain ${chainId}, expected ${LOCAL_CHAIN_ID}.`);

  let stdout = "";
  try {
    stdout = execFileSync("forge", [
      "script", "script/DeployBossPool.s.sol:DeployBossPool",
      "--rpc-url", rpcUrl,
      "--chain", String(LOCAL_CHAIN_ID),
      "--unlocked", "--sender", anvilSender,
      "--broadcast", "--slow", "--non-interactive",
    ], { cwd: contractsDir, encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
    process.stdout.write(stdout);
  } catch (error) {
    const failed = error as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
    if (failed.stdout) process.stdout.write(String(failed.stdout));
    if (failed.stderr) process.stderr.write(String(failed.stderr));
    throw new Error(`Local seed failed: ${failed.message ?? "Forge exited unsuccessfully."}`);
  }

  const summaryLine = stdout.split(/\r?\n/).find((line) => line.includes("BOSS_POOL_DEPLOYMENT_JSON="));
  if (!summaryLine) throw new Error("Forge completed without the deployment summary marker; no manifest was written.");
  const markerIndex = summaryLine.indexOf("BOSS_POOL_DEPLOYMENT_JSON=") + "BOSS_POOL_DEPLOYMENT_JSON=".length;
  const summary = JSON.parse(summaryLine.slice(markerIndex)) as Record<string, unknown>;
  if (summary.chainId !== LOCAL_CHAIN_ID || !summary.addresses || typeof summary.addresses !== "object") {
    throw new Error("The Forge deployment summary does not describe the expected local chain and contract addresses.");
  }

  const broadcastPath = path.join(contractsDir, `broadcast/DeployBossPool.s.sol/${LOCAL_CHAIN_ID}/run-latest.json`);
  const broadcast = JSON.parse(await readFile(broadcastPath, "utf8")) as {
    receipts?: Array<{ contractAddress?: string | null; transactionHash?: string; blockNumber?: string | number; status?: string | number }>;
  };
  const routerAddress = (summary.addresses as Record<string, unknown>).router;
  if (typeof routerAddress !== "string") throw new Error("Forge deployment summary is missing the router address.");
  const routerReceipt = broadcast.receipts?.find((receipt) => receipt.contractAddress?.toLowerCase() === routerAddress.toLowerCase());
  if (!routerReceipt?.transactionHash || !routerReceipt.blockNumber || !isSuccessfulReceipt(routerReceipt.status)) {
    throw new Error("Could not find a successful router deployment receipt in Foundry's broadcast record.");
  }
  const deployedAtBlock = parseQuantity(routerReceipt.blockNumber);

  const deployment = parseLocalDeployment({
    ...summary,
    schemaVersion: 1,
    chainId: LOCAL_CHAIN_ID,
    rpcUrl,
    deployedAtBlock,
    deploymentTxHash: routerReceipt.transactionHash,
  });
  await verifyLocalDeployment(deployment, client);

  await mkdir(path.dirname(manifestPath), { recursive: true });
  const temporaryPath = `${manifestPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(deployment, null, 2)}\n`);
  await rename(temporaryPath, manifestPath);
  console.log(`Wrote verified local deployment metadata to ${path.relative(root, manifestPath)}.`);
}

function resolveManifestPath(): string {
  const defaultPath = path.join(root, "apps/web/public/deployments/local.json");
  const override = process.env.LOCAL_DEPLOYMENT_PATH;
  if (!override) return defaultPath;
  const resolved = path.resolve(root, override);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("LOCAL_DEPLOYMENT_PATH must stay inside this workspace.");
  }
  if (!relative.startsWith(`.scratch${path.sep}`)) {
    throw new Error("LOCAL_DEPLOYMENT_PATH overrides must be written under .scratch/.");
  }
  return resolved;
}

function parseQuantity(value: string | number): number {
  const parsed = typeof value === "number" ? value : value.startsWith("0x") ? Number.parseInt(value, 16) : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("The router deployment receipt has an invalid block number.");
  return parsed;
}

function isSuccessfulReceipt(status: string | number | undefined): boolean {
  return status === 1 || status === "1" || status === "0x1" || status === "success";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
