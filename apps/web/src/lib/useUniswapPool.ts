"use client";

import { bossPoolHookAbi } from "@boss-pool/chain";
import { useEffect, useMemo, useState } from "react";
import type { DeploymentState } from "./useBossPool";
import { buildPoolStat, type PoolStat } from "./poolMath";

/**
 * Read-only view model for the market's pool ledger. A pure selector over the round
 * snapshot the app already polls every 5s (price, volume, tokens), plus one
 * supplementary `readContract` for the single field that snapshot omits — the current
 * stage's liquidity. Keyed on the stage rather than the poll so it does not add a
 * request every 5s; falls back to the MockUSD-in-pool proxy on RPC failure so the
 * panel never blanks. Never writes state or sends a transaction.
 */
export function useUniswapPool(deployment: DeploymentState): PoolStat {
  const live = deployment.kind === "live" ? deployment : null;
  const round = live?.round;
  const publicClient = live?.context.publicClient;
  const hookAddress = live?.context.hookAddress;
  const currentStage = round?.currentStage;

  const [stageLiquidity, setStageLiquidity] = useState<bigint | null>(null);

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

  return useMemo(() => buildPoolStat(round, stageLiquidity), [round, stageLiquidity]);
}
