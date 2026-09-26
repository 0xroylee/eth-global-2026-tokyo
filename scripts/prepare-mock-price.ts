import { readFile } from "node:fs/promises";
import { createBossPoolSdk, createPublicClientForNetwork, parseDeployment, resolveBossDeployment, mockBossPriceSourceAbi } from "@boss-pool/chain";
import { encodeFunctionData, getAddress, formatUnits } from "viem";

// Read-only preparation. Deployment and owner transactions are separate, explicit actions.
const manifest = parseDeployment(JSON.parse(await readFile(process.env.BOSS_DEMO_DEPLOYMENT_PATH ?? ".scratch/battle-routing/factory-local.json", "utf8")));
const hook = getAddress(process.env.BOSS_DEMO_HOOK ?? "");
const rpcUrl = process.env.BOSS_DEMO_RPC_URL ?? (manifest.chainId === 31337 ? manifest.rpcUrl : "https://sepolia.base.org");
const client = createPublicClientForNetwork(manifest.chainId, rpcUrl);
const deployment = await resolveBossDeployment(client, manifest, hook);
if (!deployment.mockOracle) throw new Error("This verified boss has no demo mock price source.");
const sdk = createBossPoolSdk({ publicClient: client, deployment });
const round = await sdk.readRound();
if (round.currentStage !== 0 || round.totalVolume !== 0n) throw new Error("Prepare the initial reference before the first attack.");
const quote = await sdk.quoteMockInitialPrice();
const priceX128 = quote.priceX128;
const humanPrice = priceX128 * 10n ** BigInt(round.hpToken.decimals) * 1_000_000_000_000n / (1n << 128n) / 1_000_000n;
console.log(JSON.stringify({ label: "TESTNET MOCK PRICE", chainId: manifest.chainId, hook, source: deployment.mockOracle.source,
  quotedBlock: quote.quotedBlock.toString(), reference: `${formatUnits(humanPrice, 12)} MockUSD per ${round.hpToken.symbol}`,
  priceX128: priceX128.toString(), method: "setInitialPrice", calldata: encodeFunctionData({ abi: mockBossPriceSourceAbi, functionName: "setInitialPrice", args: [priceX128] }),
  presets: { reset: priceX128.toString(), fourTimes: (priceX128 * 4n).toString(), quarter: (priceX128 / 4n).toString() }, broadcast: false }, null, 2));
