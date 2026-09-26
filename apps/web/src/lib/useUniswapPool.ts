"use client";

import { bossPoolHookAbi, royTokenAbi } from "@boss-pool/chain";
import { useEffect, useMemo, useState } from "react";
import type { DeploymentState } from "./useBossPool";
import { buildPoolStat, type PoolStat, type PoolToken } from "./poolMath";

/**
 * Read-only view model for the market's pool ledger. A pure selector over the round
 * snapshot the app already polls every 5s (price, volume, tokens), plus two supplementary
 * `readContract`s for identity the snapshot omits: the current stage's liquidity, and —
 * on the Factory path, where the round reports `rewardToken = hpToken` — the real pool
 * counter token (ROY). The counter read is keyed on the deployment (ROY metadata is
 * immutable) so it does not add a request every 5s, and falls back to a neutral label on
 * RPC failure. Never writes state or sends a transaction.
 */
export function useUniswapPool(deployment: DeploymentState): PoolStat {
  const live = deployment.kind === "live" ? deployment : null;
  const round = live?.round;
  const publicClient = live?.context.publicClient;
  const hookAddress = live?.context.hookAddress;
  const currentStage = round?.currentStage;
  const encounterMode = round?.encounterMode;
  const royAddress = live?.context.manifest.addresses.roy;

  const [stageLiquidity, setStageLiquidity] = useState<bigint | null>(null);
  const [attackToken, setAttackToken] = useState<PoolToken | null>(null);

  useEffect(() => {
    if (!publicClient || !hookAddress || currentStage === undefined) {
      setStageLiquidity(null);
      return;
    }
    let active = true;
    void publicClient
      .readContract({ address: hookAddress, abi: bossPoolHookAbi, functionName: "stageLiquidity", args: [currentStage] })
      .then((value) => {
        if (active) setStageLiquidity(value as bigint);
      })
      .catch(() => {
        // RPC 429 / not live: fall back to the MockUSD proxy in the view model.
        if (active) setStageLiquidity(null);
      });
    return () => {
      active = false;
    };
  }, [publicClient, hookAddress, currentStage]);

  useEffect(() => {
    // Only the Factory boss pool pairs BossHP against ROY; standalone already pairs BossHP
    // with its MockUSD reward, whose metadata rides in the round snapshot. ROY symbol and
    // decimals are immutable, so this resolves once per deployment rather than per poll.
    if (!publicClient || !royAddress || encounterMode !== "factory") {
      setAttackToken(null);
      return;
    }
    let active = true;
    void Promise.all([
      publicClient.readContract({ address: royAddress, abi: royTokenAbi, functionName: "symbol" }),
      publicClient.readContract({ address: royAddress, abi: royTokenAbi, functionName: "decimals" }),
    ])
      .then(([symbol, decimals]) => {
        if (active) setAttackToken({ symbol, decimals: Number(decimals) });
      })
      .catch(() => {
        // RPC 429 / not live: buildPoolStat shows a neutral label instead of a self-pair.
        if (active) setAttackToken(null);
      });
    return () => {
      active = false;
    };
  }, [publicClient, royAddress, encounterMode]);

  return useMemo(() => buildPoolStat(round, stageLiquidity, attackToken), [round, stageLiquidity, attackToken]);
}
