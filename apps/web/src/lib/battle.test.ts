import { describe, expect, test } from "bun:test";
import type { DecodedContractEvent, LocalDeploymentManifest } from "@boss-pool/chain";
import { attackPlaybackChoice, attackWaitPhase, confirmedBattleAttack, rememberSeenAttackId, roundSecondsLeft, writeStateMatchesEncounter, SEEN_ATTACK_LIMIT } from "./battle";
import { findBossPresentation } from "../game/bosses";
import type { WriteState } from "./useBossPool";

const account = "0x0000000000000000000000000000000000000001";
const other = "0x0000000000000000000000000000000000000002";
const manifest: LocalDeploymentManifest = {
  schemaVersion: 1, chainId: 31337, rpcUrl: "http://127.0.0.1:8547", deployedAtBlock: 1,
  deploymentTxHash: "0x1234",
  addresses: { hook: other, router: account, bossHP: account, roy: account, mockUSD: account, collectibles: account, poolManager: account },
};
const record: Extract<WriteState, { status: "confirmed" }>["record"] = {
  network: "local" as const, manifest, submittedAt: 0,
  request: { kind: "attack" as const, chainId: 31337, account, target: manifest.addresses.router, hash: "0x5678" as const, calldata: "0x" as const },
};
const events: DecodedContractEvent[] = [
  { address: other, eventName: "AttackRecorded", transactionHash: "0x5678", logIndex: 1,
    args: { player: account, stage: 0, bossHPOut: 7123456789012345678n, cumulativeSold: 300n * 10n ** 18n } },
  { address: other, eventName: "StageCleared", transactionHash: "0x5678", logIndex: 2,
    args: { stage: 0, sold: 300n * 10n ** 18n, capacity: 300n * 10n ** 18n, roundingDust: 0n } },
  { address: other, eventName: "StageActivated", transactionHash: "0x5678", logIndex: 3,
    args: { stage: 1, sqrtPriceX96: 1n, liquidity: 1n, capacity: 600n * 10n ** 18n } },
];
const confirmed: Extract<WriteState, { status: "confirmed" }> = { status: "confirmed", action: "Attack", record, result: { events } };

describe("confirmed battle effects", () => {
  test("a clearing receipt keeps its actual damage on the old stage and supports recovered results", () => {
    const hit = confirmedBattleAttack(confirmed, "local", manifest, other, account);
    expect(hit?.bossHPOut).toBe(7123456789012345678n);
    expect(hit?.stage).toBe(0);
    expect(hit?.stageCleared).toBe(true);
    expect(hit?.defeated).toBe(false);
    expect(confirmedBattleAttack({ ...confirmed, action: "attack", result: { action: "attack", account, events } }, "local", manifest, other, account)?.id).toBe(hit?.id);
  });

  test("pending, failed, other-wallet, other-deployment, and other-emitter results produce no hit", () => {
    const invalidStates: WriteState[] = [
      { status: "pending", action: "Attack", record },
      { status: "unresolved", action: "Attack", record, message: "Receipt pending" },
      { status: "reverted", action: "Attack", message: "Reverted" },
      { ...confirmed, record: { ...record, request: { ...record.request, kind: "approval" } } },
      { ...confirmed, record: { ...record, request: { ...record.request, target: other } } },
      { ...confirmed, result: { events: events.map((event) => ({ ...event, address: account })) } },
    ];
    for (const state of invalidStates) expect(confirmedBattleAttack(state, "local", manifest, other, account)).toBeNull();
    expect(confirmedBattleAttack(confirmed, "local", manifest, other, other)).toBeNull();
    expect(confirmedBattleAttack(confirmed, "local", { ...manifest, deploymentTxHash: "0xabcd" }, other, account)).toBeNull();
    expect(confirmedBattleAttack(confirmed, "base-sepolia", manifest, other, account)).toBeNull();
    expect(confirmedBattleAttack(confirmed, "local", manifest, account, account)).toBeNull();
    expect(confirmedBattleAttack(confirmed, "local", undefined, other, account)).toBeNull();
  });

  test("a sibling Hook from the same launch transaction cannot reuse this receipt", () => {
    const siblingHook = "0x0000000000000000000000000000000000000003" as const;
    const siblingManifest = { ...manifest, addresses: { ...manifest.addresses, hook: siblingHook } };
    const rejectedForOriginalHook: WriteState = {
      status: "rejected", action: "Attack", network: "local", hookAddress: other, message: "Wallet request rejected",
    };
    expect(confirmedBattleAttack(confirmed, "local", siblingManifest, siblingHook, account)).toBeNull();
    expect(writeStateMatchesEncounter(confirmed, "local", siblingHook)).toBe(false);
    expect(writeStateMatchesEncounter(confirmed, "local", other)).toBe(true);
    expect(writeStateMatchesEncounter(rejectedForOriginalHook, "local", siblingHook)).toBe(false);
    expect(writeStateMatchesEncounter(rejectedForOriginalHook, "local", other)).toBe(true);
  });
});

test("boss presentation is address and chain scoped, with casing-insensitive known lookups", () => {
  const baseHook = "0xe217b4840049f928d4392030ac86aCe6b3766AC0";
  const newBaseHook = "0xc11D07448948AC4757592E91D8f5155907Ef6AC0";
  expect(findBossPresentation(84532, baseHook.toUpperCase().replace("0X", "0x"))?.name).toBe("Pool Unis");
  expect(findBossPresentation(84532, newBaseHook)?.stageImages).toEqual([
    "/images/boss-cat-form-a.png?v=6",
    "/images/boss-cat-form-b.png?v=6",
    "/images/boss-cat-form-c.png?v=8",
  ]);
  expect(findBossPresentation(31337, other, other)?.name).toBe("Pool Unis");
  expect(findBossPresentation(31337, account, other)).toBeUndefined();
  expect(findBossPresentation(84532, other)).toBeUndefined();
});

test("stage-clear and defeat flags come from that receipt, and a defeat still keeps the original stage output", () => {
  const defeated = confirmedBattleAttack({
    ...confirmed,
    result: { events: [...events, { address: other, eventName: "BossDefeated", transactionHash: "0x5678", logIndex: 4, args: { finalEligibleHP: 1n, originalPrize: 1n } }] },
  }, "local", manifest, other, account);
  expect(defeated?.bossHPOut).toBe(7123456789012345678n);
  expect(defeated?.stage).toBe(0);
  expect(defeated?.stageCleared).toBe(true);
  expect(defeated?.defeated).toBe(true);
});

test("attack presentation follows the request kind, not the action label", () => {
  const prompting: WriteState = { status: "prompting", action: "Attack", requestKind: "approval", network: "local", hookAddress: other, manifest };
  expect(attackWaitPhase(prompting, "local", other)).toBeNull();
  expect(attackWaitPhase({ ...prompting, requestKind: "attack" }, "local", other)).toBe("charging");
  expect(attackWaitPhase({ status: "pending", action: "Approve attack input", record }, "local", other)).toBe("pending");
  expect(attackWaitPhase({ status: "unresolved", action: "Attack", record: { ...record, request: { ...record.request, kind: "approval" } }, message: "Receipt pending" }, "local", other)).toBeNull();
  expect(attackWaitPhase({ status: "unresolved", action: "Checking", record, message: "Receipt pending" }, "local", other)).toBe("checking");
  expect(attackWaitPhase({ status: "rejected", action: "Attack", requestKind: "attack", message: "Wallet request rejected", network: "local", hookAddress: other }, "local", other)).toBeNull();
});

test("a confirmed attack id is remembered once, capped, and a cancelled start does not consume it", () => {
  const memory = { ids: [] as string[] };
  const storage = new Map<string, string>();
  const store = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, value); },
  };
  expect(attackPlaybackChoice({ id: "hit-1", hidden: false, cancelled: true, memory, storage: store })).toBe("cancelled");
  expect(memory.ids).toEqual([]);
  expect(attackPlaybackChoice({ id: "hit-1", hidden: false, cancelled: false, memory, storage: store })).toBe("play");
  expect(attackPlaybackChoice({ id: "hit-1", hidden: false, cancelled: false, memory, storage: store })).toBe("static");
  expect(attackPlaybackChoice({ id: "hit-2", hidden: true, cancelled: false, memory, storage: store })).toBe("static");
  expect(memory.ids).toEqual(["hit-1", "hit-2"]);
  const capped = { ids: [] as string[] };
  for (let index = 0; index < SEEN_ATTACK_LIMIT + 1; index += 1) rememberSeenAttackId(`id-${index}`, capped, null);
  expect(capped.ids).toHaveLength(SEEN_ATTACK_LIMIT);
  expect(capped.ids[0]).toBe("id-1");
  expect(rememberSeenAttackId("id-1", capped, null)).toBe(false);
});

test("the displayed deadline advances from chain time without restarting on mount or going negative", () => {
  expect(roundSecondsLeft({ blockTimestamp: 100n, deadline: 0n }, 0, 1_000_000)).toBeNull();
  const round = { blockTimestamp: 100n, deadline: 120n };
  expect(roundSecondsLeft(round, 5_000, 5_000)).toBe(20);
  expect(roundSecondsLeft(round, 5_000, 12_000)).toBe(13);
  expect(roundSecondsLeft(round, 5_000, 30_000)).toBe(0);
  expect(roundSecondsLeft(round, 5_000, 1_000)).toBe(20);
});
