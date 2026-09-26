import type { Address, DecodedContractEvent, DeploymentManifest, RoundSnapshot } from "@boss-pool/chain";
import type { NetworkKey, WriteState } from "./useBossPool";

export type BossVisualState = "idle" | "hit" | "transition" | "defeated";
export const STAGE_HUES = ["#95a7f6", "#b685ff", "#f08cff"] as const;

export function roundSecondsLeft(round: Pick<RoundSnapshot, "deadline" | "blockTimestamp">, readAt: number, now: number): number | null {
  if (round.deadline === 0n) return null;
  const elapsed = Math.max(0, Math.floor((now - readAt) / 1_000));
  return Math.max(0, Number(round.deadline - round.blockTimestamp) - elapsed);
}

/** Receipt effects belong to the selected deployment and wallet, including recovered receipts. */
export function confirmedBattleAttack(
  state: WriteState,
  network: NetworkKey,
  manifest: DeploymentManifest | undefined,
  hookAddress: Address | string | undefined,
  account: Address | undefined,
) {
  if (state.status !== "confirmed" || !manifest || !hookAddress || !account) return null;
  const { record } = state;
  if (record.request.kind !== "attack" || record.network !== network ||
    record.request.chainId !== manifest.chainId ||
    record.request.account.toLowerCase() !== account.toLowerCase() ||
    record.manifest.deploymentTxHash.toLowerCase() !== manifest.deploymentTxHash.toLowerCase() ||
    (record.hookAddress ?? record.manifest.addresses.hook).toLowerCase() !== hookAddress.toLowerCase() ||
    record.request.target.toLowerCase() !== manifest.addresses.router.toLowerCase()) return null;
  if (!state.result || typeof state.result !== "object" || !("events" in state.result) || !Array.isArray(state.result.events)) return null;
  const events = (state.result.events as readonly DecodedContractEvent[]).filter(
    (event) => event.address.toLowerCase() === hookAddress.toLowerCase(),
  );
  const hit = events.find((event) => event.eventName === "AttackRecorded");
  if (!hit || hit.args.player.toLowerCase() !== account.toLowerCase() || hit.args.bossHPOut <= 0n ||
    hit.args.stage < 0 || hit.args.stage > 2) return null;
  return {
    id: `${manifest.chainId}:${hookAddress.toLowerCase()}:${manifest.deploymentTxHash}:${hit.transactionHash}:${hit.logIndex}`,
    hookAddress: hookAddress as Address,
    transactionHash: hit.transactionHash,
    logIndex: hit.logIndex,
    stage: hit.args.stage,
    bossHPOut: hit.args.bossHPOut,
    stageCleared: events.some((event) => event.eventName === "StageCleared" && event.args.stage === hit.args.stage),
    defeated: events.some((event) => event.eventName === "BossDefeated"),
  };
}

export type ConfirmedBattleAttack = NonNullable<ReturnType<typeof confirmedBattleAttack>>;

export const SEEN_ATTACK_LIMIT = 100;
export const SEEN_ATTACK_KEY = "boss-pool.seen-attack-effects.v1";

type SeenStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type SeenAttackMemory = { ids: string[] };

/** Charging, submitted, or receipt-checking for this encounter's attack. Approval and other actions stay null. */
export function attackWaitPhase(
  state: WriteState,
  network: NetworkKey,
  hookAddress: string | undefined,
): "charging" | "pending" | "checking" | null {
  if (!writeStateMatchesEncounter(state, network, hookAddress)) return null;
  if (state.status === "prompting") return state.requestKind === "attack" ? "charging" : null;
  if (state.status === "pending" && state.record.request.kind === "attack") return "pending";
  if (state.status === "unresolved" && state.record.request.kind === "attack") return "checking";
  return null;
}

export function rememberSeenAttackId(id: string, memory: SeenAttackMemory, storage: SeenStorage | null): boolean {
  let ids = memory.ids;
  if (storage) {
    try {
      const raw = storage.getItem(SEEN_ATTACK_KEY);
      const parsed = raw ? JSON.parse(raw) as unknown : [];
      if (Array.isArray(parsed)) ids = parsed.filter((entry): entry is string => typeof entry === "string");
    } catch {
      ids = memory.ids;
    }
  }
  if (ids.includes(id)) {
    memory.ids = ids.slice(-SEEN_ATTACK_LIMIT);
    return false;
  }
  const next = [...ids, id].slice(-SEEN_ATTACK_LIMIT);
  memory.ids = next;
  try {
    storage?.setItem(SEEN_ATTACK_KEY, JSON.stringify(next));
  } catch {
    // The in-memory list still blocks a replay in this page session.
  }
  return true;
}

/** Persist the id before playback. A cancelled start leaves it unseen so StrictMode can play on the surviving run. */
export function attackPlaybackChoice(input: {
  id: string;
  hidden: boolean;
  cancelled: boolean;
  memory: SeenAttackMemory;
  storage: SeenStorage | null;
}): "cancelled" | "static" | "play" {
  if (input.cancelled) return "cancelled";
  const fresh = rememberSeenAttackId(input.id, input.memory, input.storage);
  if (!fresh || input.hidden) return "static";
  return "play";
}

export function writeStateMatchesEncounter(state: WriteState, network: NetworkKey, hookAddress: string | undefined): boolean {
  if (state.status === "idle") return true;
  if (!hookAddress) return false;
  if (state.status === "prompting") {
    return state.network === network && state.hookAddress.toLowerCase() === hookAddress.toLowerCase();
  }
  if (state.status === "pending" || state.status === "unresolved" || state.status === "confirmed") {
    const recordHook = state.record.hookAddress ?? state.record.manifest.addresses.hook;
    return state.record.network === network && recordHook.toLowerCase() === hookAddress.toLowerCase();
  }
  return state.network === network && state.hookAddress?.toLowerCase() === hookAddress.toLowerCase();
}
