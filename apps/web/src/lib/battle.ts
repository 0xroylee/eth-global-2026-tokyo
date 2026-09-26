import type { Address, DecodedContractEvent, DeploymentManifest, RoundSnapshot } from "@boss-pool/chain";
import type { NetworkKey, WriteState } from "./useBossPool";

export type BossVisualState = "idle" | "hit" | "transition" | "defeated";
export const STAGE_HUES = ["#95a7f6", "#b685ff", "#f08cff"] as const;

export function roundSecondsLeft(round: Pick<RoundSnapshot, "deadline" | "blockTimestamp">, readAt: number, now: number): number {
  const elapsed = Math.max(0, Math.floor((now - readAt) / 1_000));
  return Math.max(0, Number(round.deadline - round.blockTimestamp) - elapsed);
}

/** Receipt effects belong to the selected deployment and wallet, including recovered receipts. */
export function confirmedBattleAttack(
  state: WriteState,
  network: NetworkKey,
  manifest: DeploymentManifest | undefined,
  account: Address | undefined,
) {
  if (state.status !== "confirmed" || !manifest || !account) return null;
  const { record } = state;
  if (record.request.kind !== "attack" || record.network !== network ||
    record.request.chainId !== manifest.chainId ||
    record.request.account.toLowerCase() !== account.toLowerCase() ||
    record.manifest.deploymentTxHash.toLowerCase() !== manifest.deploymentTxHash.toLowerCase() ||
    record.request.target.toLowerCase() !== manifest.addresses.router.toLowerCase()) return null;
  if (!state.result || typeof state.result !== "object" || !("events" in state.result) || !Array.isArray(state.result.events)) return null;
  const events = (state.result.events as readonly DecodedContractEvent[]).filter(
    (event) => event.address.toLowerCase() === manifest.addresses.hook.toLowerCase(),
  );
  const hit = events.find((event) => event.eventName === "AttackRecorded");
  if (!hit || hit.args.player.toLowerCase() !== account.toLowerCase() || hit.args.bossHPOut <= 0n ||
    hit.args.stage < 0 || hit.args.stage > 2) return null;
  return {
    id: `${manifest.chainId}:${manifest.deploymentTxHash}:${hit.transactionHash}:${hit.logIndex}`,
    transactionHash: hit.transactionHash,
    logIndex: hit.logIndex,
    stage: hit.args.stage,
    bossHPOut: hit.args.bossHPOut,
    stageCleared: events.some((event) => event.eventName === "StageCleared" && event.args.stage === hit.args.stage),
    defeated: events.some((event) => event.eventName === "BossDefeated"),
  };
}

export type ConfirmedBattleAttack = NonNullable<ReturnType<typeof confirmedBattleAttack>>;
