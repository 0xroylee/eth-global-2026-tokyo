import { formatEther } from "viem";
import {
  assertCancunTransientStorage,
  assertBaseSepoliaChain,
  loadTestnetConfig,
  parseForgeGas,
  publicRpcLabel,
  redactSensitive,
  runDeploymentScript,
} from "./testnet-common";

async function main() {
  const config = loadTestnetConfig();
  const head = await assertBaseSepoliaChain(config.client);
  await assertCancunTransientStorage(config.client);

  const [deployerBalance, playerBBalance, gasPrice] = await Promise.all([
    config.client.getBalance({ address: config.deployerAddress }),
    config.client.getBalance({ address: config.playerBAddress }),
    config.client.getGasPrice(),
  ]);
  const forgeOutput = await runDeploymentScript(config, false);
  const estimate = parseForgeGas(forgeOutput);
  const deployBudget = estimate.requiredWei * 125n / 100n;
  const exerciseReserve = gasPrice * 10_000_000n;
  const deployReady = deployerBalance >= deployBudget + exerciseReserve;
  const exerciseReady = deployerBalance >= exerciseReserve && playerBBalance >= exerciseReserve;

  console.log(`Base Sepolia preflight: chain 84532, head ${head}, RPC host ${publicRpcLabel(config.rpcUrl)}.`);
  console.log("Cancun TSTORE/TLOAD eth_call probe: PASS.");
  console.log(`PoolManager plan: team-deploy from the pinned v4-core submodule; no official manager address is assumed.`);
  console.log(`Deployer ${config.deployerAddress}: ${formatEther(deployerBalance)} testETH.`);
  console.log(`Player B ${config.playerBAddress}: ${formatEther(playerBBalance)} testETH.`);
  console.log(`Forge deploy estimate: ${estimate.gas.toString()} gas, ${formatEther(estimate.requiredWei)} testETH; with 25% buffer ${formatEther(deployBudget)}.`);
  console.log(`Exercise reserve estimate: ${formatEther(exerciseReserve)} testETH per wallet (10M gas at current gas price ${gasPrice.toString()} wei).`);
  console.log(`Deployment funding: ${deployReady ? "READY" : "NEEDS DEPLOYER FUNDING"}. Exercise funding: ${exerciseReady ? "READY" : "NEEDS PLAYER GAS FUNDING"}.`);
}

main().catch((error) => {
  console.error(redactSensitive(error instanceof Error ? error.message : "Testnet preflight failed."));
  process.exitCode = 1;
});
