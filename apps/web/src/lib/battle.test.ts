import { describe, expect, test } from "bun:test";
import type { DecodedContractEvent, LocalDeploymentManifest } from "@boss-pool/chain";
import { confirmedBattleAttack, roundSecondsLeft } from "./battle";
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
    const hit = confirmedBattleAttack(confirmed, "local", manifest, account);
    expect(hit?.bossHPOut).toBe(7123456789012345678n);
    expect(hit?.stage).toBe(0);
    expect(hit?.stageCleared).toBe(true);
    expect(hit?.defeated).toBe(false);
    expect(confirmedBattleAttack({ ...confirmed, action: "attack", result: { action: "attack", account, events } }, "local", manifest, account)?.id).toBe(hit?.id);
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
    for (const state of invalidStates) expect(confirmedBattleAttack(state, "local", manifest, account)).toBeNull();
    expect(confirmedBattleAttack(confirmed, "local", manifest, other)).toBeNull();
    expect(confirmedBattleAttack(confirmed, "local", { ...manifest, deploymentTxHash: "0xabcd" }, account)).toBeNull();
    expect(confirmedBattleAttack(confirmed, "base-sepolia", manifest, account)).toBeNull();
    expect(confirmedBattleAttack(confirmed, "local", undefined, account)).toBeNull();
  });
});

test("the displayed deadline advances from chain time without restarting on mount or going negative", () => {
  const round = { blockTimestamp: 100n, deadline: 120n };
  expect(roundSecondsLeft(round, 5_000, 5_000)).toBe(20);
  expect(roundSecondsLeft(round, 5_000, 12_000)).toBe(13);
  expect(roundSecondsLeft(round, 5_000, 30_000)).toBe(0);
  expect(roundSecondsLeft(round, 5_000, 1_000)).toBe(20);
});
