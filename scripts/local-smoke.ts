import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createLocalPublicClient,
  parseLocalDeployment,
  readLocalRound,
  verifyLocalDeployment,
} from "@boss-pool/chain";

const root = process.cwd();
const manifestPath = path.join(root, "apps/web/public/deployments/local.json");
const statusNames = ["Setup", "Active", "Stage cleared", "Defeated", "Expired"];

async function main() {
  const manifest = parseLocalDeployment(JSON.parse(await readFile(manifestPath, "utf8")));
  const client = createLocalPublicClient(manifest);
  await verifyLocalDeployment(manifest, client);
  const round = await readLocalRound(manifest);

  if (round.status !== 1 || round.currentStage !== 0 || round.stageSold.some((sold) => sold !== 0n)) {
    throw new Error("The seeded local round is not active at stage 1 with zero player damage.");
  }
  if (round.originalPrize !== 1_000_000_000n || round.mockUSDInHook < round.originalPrize) {
    throw new Error("The Hook MockUSD balance is below the funded 1,000 MockUSD original prize.");
  }
  if (round.bossHPTotalSupply !== 2_000n * 10n ** 18n) {
    throw new Error("BossHP total supply does not match the fixed 2,000 HP fixture.");
  }
  const expectedTicks: readonly [number, number] = round.bossHPCurrency0 ? [0, 1_920] : [-1_920, 0];
  const expectedStart = round.bossHPCurrency0 ? round.bossSqrtLowerX96 : round.bossSqrtUpperX96;
  if (
    round.bossTickLower !== expectedTicks[0] || round.bossTickUpper !== expectedTicks[1] ||
    round.bossInitialSqrtPriceX96 !== expectedStart || round.stageEndSqrtPriceX96.some((price) => price !== 0n)
  ) throw new Error("Boss pool bounds do not preserve the normalized 1.0-to-1.211659 ROY-per-HP band.");
  const heldBossHP = round.bossHPInHook + round.bossHPInRouter + round.bossHPInPoolManager;
  if (heldBossHP !== round.bossHPTotalSupply || round.finalEligibleHP !== 0n || round.redeemedHP !== 0n) {
    throw new Error("BossHP custody does not reconcile across the live seed contracts.");
  }
  for (const [index, capacity] of round.stageCapacity.entries()) {
    const nominal = BigInt(300 * (index + 1)) * 10n ** 18n;
    if (capacity < nominal || capacity > nominal + 1n) throw new Error(`Stage ${index + 1} capacity is outside its one-unit rounding bound.`);
  }

  console.log(`Verified local deployment at block ${manifest.deployedAtBlock} on chain ${manifest.chainId}.`);
  console.log(`Round: ${statusNames[round.status]} · stage ${round.currentStage + 1} · sold ${round.stageSold.map((amount) => amount.toString()).join(", ")}`);
  console.log(`Boss pool: HP currency${round.bossHPCurrency0 ? 0 : 1} · ticks ${round.bossTickLower} to ${round.bossTickUpper} · normalized stage-1 band verified.`);
  console.log(`Original prize: ${round.originalPrize.toString()} MockUSD base units; Hook balance: ${round.mockUSDInHook.toString()}; BossHP supply: ${round.bossHPTotalSupply.toString()}.`);
  console.log(`BossHP custody: router ${round.bossHPInRouter.toString()}, PoolManager ${round.bossHPInPoolManager.toString()}, hook ${round.bossHPInHook.toString()}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
