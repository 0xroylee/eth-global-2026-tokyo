"use client";

import { useEffect, useState } from "react";
import {
  createLocalPublicClient,
  fetchLocalDeployment,
  readLocalRound,
  verifyLocalDeployment,
  type LocalDeploymentManifest,
  type LocalRoundSnapshot,
} from "@boss-pool/chain";

export type DeploymentState =
  | { kind: "loading" }
  | { kind: "live"; manifest: LocalDeploymentManifest; round: LocalRoundSnapshot }
  | { kind: "not-deployed" }
  | { kind: "error"; message: string };

const REFRESH_MS = 5_000;

/**
 * Polls the local deployment manifest and on-chain round state.
 * Runs only in the browser; the server never owns game state.
 */
export function useLocalRound(): DeploymentState {
  const [state, setState] = useState<DeploymentState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const manifest = await fetchLocalDeployment();
        const client = createLocalPublicClient(manifest);
        await verifyLocalDeployment(manifest, client);
        const round = await readLocalRound(manifest);
        if (active) setState({ kind: "live", manifest, round });
      } catch (error) {
        if (!active) return;
        if (error instanceof Error && error.message === "LOCAL_DEPLOYMENT_MISSING") {
          setState({ kind: "not-deployed" });
        } else {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "Could not read local contract state.",
          });
        }
      }
    };
    void load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  return state;
}
