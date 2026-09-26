import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AttackQuote, RoundSnapshot } from "@boss-pool/chain";
import { BattleDetails } from "../components/battle/BattleDetails";
import { battleProgress } from "./battleDetails";

const round: RoundSnapshot = {
  blockNumber: 1n, blockTimestamp: 1n, encounterMode: "factory",
  hpToken: { address: "0x0000000000000000000000000000000000000001", symbol: "MEME", decimals: 6 },
  rewardToken: { address: "0x0000000000000000000000000000000000000001", symbol: "MEME", decimals: 6 },
  deadline: 0n, status: 1, currentStage: 1,
  stageSold: [90_000_000n, 20_000_000n, 0n], stageCapacity: [100_000_000n, 200_000_000n, 300_000_000n],
  stageVolume: [12_000_000n, 10_000_000n, 0n], stageVolumeTarget: [10_000_000n, 20_000_000n, 30_000_000n],
  totalVolume: 22_000_000n, volumeTargetMockUSD: 60_000_000n, stageEndSqrtPriceX96: [0n, 0n, 0n],
  remainingSellableHP: 180_000_000n, supplyPoolFee: 3000, bossPoolFee: 3000, bossHPCurrency0: true,
  bossTickLower: 0, bossTickUpper: 1920, bossSqrtLowerX96: 0n, bossSqrtUpperX96: 0n,
  bossCurrentSqrtPriceX96: 0n, bossInitialSqrtPriceX96: 0n, originalPrize: 0n, mockUSDInHook: 0n,
  finalEligibleHP: 0n, redeemedHP: 0n, paidPrize: 0n, bossHPTotalSupply: 0n, bossHPInHook: 0n,
  bossHPInRouter: 0n, bossHPInPoolManager: 0n,
};

test("progress follows stage gates without carrying excess factory volume forward or counting sale residue", () => {
  const factory = battleProgress(round);
  expect(factory.stages.map((stage) => stage.percent)).toEqual([100, 50, 0]);
  expect(factory.percent).toBe(33.33);
  expect(factory.stages.map((stage) => stage.unlocked)).toEqual([true, true, false]);
  const standalone = battleProgress({ ...round, encounterMode: "standalone" });
  expect(standalone.stages.map((stage) => stage.percent)).toEqual([100, 10, 0]);
  expect(standalone.percent).toBe(20);
  expect(battleProgress({ ...round, status: 2 }).stages[1].cleared).toBe(true);
  expect(battleProgress({ ...round, status: 3, currentStage: 2 }).percent).toBe(100);
  const setup = battleProgress({ ...round, status: 0, currentStage: 0, stageSold: [0n, 0n, 0n], stageVolume: [0n, 0n, 0n] });
  expect(setup.percent).toBe(0);
  expect(setup.stages.every((stage) => !stage.unlocked)).toBe(true);
  expect(battleProgress({ ...round, status: 4 }).percent).toBe(33.33);
});

test("details use actual quoted spend for the rate, respect token decimals, and omit unavailable prices", () => {
  const address = "0x0000000000000000000000000000000000000001";
  const quote: AttackQuote = {
    chainId: 31337, deploymentTxHash: "0x01", router: address, hook: address, quotedBlock: 1n,
    quotedAt: 1n, expiresAt: 60n, stage: 1, maxMockUSD: 5_000_000n, mockUSDSpent: 2_000_000n,
    mockUSDRefunded: 3_000_000n, royBought: 1n, roySpent: 1n, royRefunded: 0n, bossHPOut: 3_000_000n,
    minRoyOut: 1n, minBossHPOut: 1n, slippageBps: 100, supplyPoolFee: 3000, bossPoolFee: 3000,
    stageCleared: false, bossDefeated: false, nextStage: 1,
  };
  const render = (value: AttackQuote | null, snapshot = round) => renderToStaticMarkup(BattleDetails({ round: snapshot, quote: value, priceStatus: "Price unavailable" }));
  expect(render(quote)).toContain("1.5 MEME per MockUSD");
  expect(render({ ...quote, bossHPOut: 3n }, { ...round, hpToken: { ...round.hpToken, decimals: 0 } })).toContain("1.5 MEME per MockUSD");
  expect(render(null)).toContain("Price unavailable");
  expect(render(null)).not.toContain("per MockUSD");
  expect(render({ ...quote, mockUSDSpent: 0n })).toContain("Price unavailable");
});
