import { describe, expect, test } from "bun:test";
import { ROBINHOOD_TESTNET_CHAIN_ID, type ActivityEntry, type ActivityPage, type LocalDeploymentManifest } from "@boss-pool/chain";
import { displayEstimate } from "./format";
import {
  addWorldEvent, blendWorldEvents, createSeededRng, generateMockEvents, MAX_WORLD_ROWS, MOCK_HANDLES,
  mockIntervalMs, selectMode, toWorldEvent, truncateActor, type WorldChannelEvent, type WorldEventContext,
} from "./worldChannel";

const router = "0x00000000000000000000000000000000000000b2";
const hook = "0x00000000000000000000000000000000000000c3";
const player = "0x00000000000000000000000000000000000000a1";
const other = "0x00000000000000000000000000000000000000d4";

const manifest: LocalDeploymentManifest = {
  schemaVersion: 1, chainId: 31337, rpcUrl: "http://127.0.0.1:8547", deployedAtBlock: 1, deploymentTxHash: "0x1234",
  addresses: { hook, router, bossHP: player, roy: player, mockUSD: player, collectibles: player, poolManager: player },
};
const ctx: WorldEventContext = { explorer: "https://explorer.example", hpDecimals: 18, hpSymbol: "HP" };
const commonBase = {
  chainId: manifest.chainId, deploymentTxHash: manifest.deploymentTxHash, blockHash: "0xabc" as const,
  blockTimestamp: 1_700_000_000n, transactionHash: "0xdead" as const, transactionIndex: 0, logIndex: 0,
};

const attackEntry: Extract<ActivityEntry, { kind: "attack" }> = {
  ...commonBase, id: "e-attack", address: router, blockNumber: 10n, kind: "attack", authority: "authoritative-damage",
  player, stage: 0, mockUSDSpent: 1_000_000n, royBought: 10n, roySpent: 10n, bossHPReceived: 7123456789012345678n, mockUSDRefunded: 0n, royRefunded: 0n,
};
const defeatedEntry: Extract<ActivityEntry, { kind: "boss-defeated" }> = {
  ...commonBase, id: "e-defeat", address: hook, blockNumber: 11n, kind: "boss-defeated", finalEligibleHP: 1n, originalPrize: 2n,
};
const stageClearedEntry: Extract<ActivityEntry, { kind: "stage-cleared" }> = {
  ...commonBase, id: "e-stage", address: hook, blockNumber: 12n, kind: "stage-cleared", stage: 1, sold: 3n, capacity: 4n, roundingDust: 0n,
};
const victoryEntry: Extract<ActivityEntry, { kind: "victory-nft-claimed" }> = {
  ...commonBase, id: "e-nft", address: hook, blockNumber: 13n, kind: "victory-nft-claimed", player, tokenId: 7n,
};
const rewardEntry: Extract<ActivityEntry, { kind: "reward-claimed" }> = {
  ...commonBase, id: "e-reward", address: hook, blockNumber: 14n, kind: "reward-claimed", player, bossHPIn: 40_000_000_000_000_000_000n, mockUSDOut: 5n,
};
const attackRecorded: Extract<ActivityEntry, { kind: "attack-recorded" }> = {
  ...commonBase, id: "e-rec", address: hook, blockNumber: 15n, kind: "attack-recorded", authority: "corroborating-only", player, stage: 0, bossHPOut: 1n, cumulativeSold: 1n,
};
const tokenTransfer: Extract<ActivityEntry, { kind: "token-transfer" }> = {
  ...commonBase, id: "e-tok", address: player, blockNumber: 16n, kind: "token-transfer", token: "BossHP", from: player, to: other, value: 1n,
};
const roundActivated: Extract<ActivityEntry, { kind: "round-activated" }> = {
  ...commonBase, id: "e-round", address: router, blockNumber: 17n, kind: "round-activated", bossPoolId: "0xpool", sqrtPriceX96: 1n, initialLiquidity: 1n,
};

function pageOf(entries: readonly ActivityEntry[], from: bigint, to: bigint): ActivityPage {
  return {
    chainId: manifest.chainId, deploymentTxHash: manifest.deploymentTxHash, rangeFromBlock: from, rangeToBlock: to,
    scannedFromBlock: from, scannedToBlock: to, snapshotBlockNumber: to, snapshotBlockHash: "0xabc", completeThroughSnapshot: true, entries,
  };
}

test("T-fmt-1 real formatter maps each surfaced kind", () => {
  const a = toWorldEvent(attackEntry, ctx);
  expect(a).toMatchObject({ kind: "attack", actor: truncateActor(player), source: "chain", timestamp: 1_700_000_000_000 });
  expect(a?.message).toBe(`struck · ≈ ${displayEstimate(attackEntry.bossHPReceived, 18)} HP`);
  expect(a?.explorerUrl).toBe(`https://explorer.example/tx/${commonBase.transactionHash}`);

  expect(toWorldEvent(rewardEntry, ctx)?.message).toBe(`redeemed ≈ ${displayEstimate(rewardEntry.bossHPIn, 18)} HP`);
  expect(toWorldEvent(victoryEntry, ctx)?.message).toBe("claimed a Victory NFT");
  expect(toWorldEvent(defeatedEntry, ctx)).toMatchObject({ kind: "boss-defeated", actor: "—", message: "The boss has fallen!" });
  expect(toWorldEvent(stageClearedEntry, ctx)?.message).toBe("Stage 2 cleared!");
  // No explorer context → no link even for a real row.
  expect(toWorldEvent(attackEntry, { hpDecimals: 18, hpSymbol: "HP" })?.explorerUrl).toBeUndefined();
});

test("T-fmt-2 whitelist drops corroborating and noise kinds", () => {
  expect(toWorldEvent(attackRecorded, ctx)).toBeNull();
  expect(toWorldEvent(tokenTransfer, ctx)).toBeNull();
  expect(toWorldEvent(roundActivated, ctx)).toBeNull();
});

test("T-det-1 mock generation is deterministic and honest", () => {
  const a = generateMockEvents(42, 8);
  expect(generateMockEvents(42, 8)).toEqual(a);
  expect(generateMockEvents(7, 8)).not.toEqual(a);
  a.forEach((event, index) => {
    expect(event.source).toBe("mock");
    expect(event.explorerUrl).toBeUndefined();
    expect(/^0x/.test(event.actor)).toBe(false);
    expect(MOCK_HANDLES).toContain(event.actor as (typeof MOCK_HANDLES)[number]);
    expect(event.kind === "boss-defeated" || event.kind === "stage-cleared").toBe(false);
    expect(event.id).toBe(`mock:42:${index}`);
  });
});

test("T-det-2 mock cadence stays in [3000, 8000)", () => {
  const rng = createSeededRng(99);
  for (let i = 0; i < 64; i += 1) {
    const ms = mockIntervalMs(rng);
    expect(ms).toBeGreaterThanOrEqual(3_000);
    expect(ms).toBeLessThan(8_000);
  }
});

describe("blendWorldEvents", () => {
  test("T-blend-1 scopes the boss, dedupes by id, and replaces the rescanned window", () => {
    const foreign = { ...attackEntry, id: "foreign", chainId: 84_532 };
    const wrongDeploy = { ...attackEntry, id: "wrong", deploymentTxHash: "0x9999" as const };
    const page = pageOf([attackEntry, attackEntry, victoryEntry, foreign, wrongDeploy], 10n, 14n);
    const first = blendWorldEvents([], page, manifest, ctx);
    expect(first.map((event) => event.id).sort()).toEqual(["e-attack", "e-nft"]);
    // Re-blending the same overlapping page must not duplicate the in-window rows.
    expect(blendWorldEvents(first, page, manifest, ctx)).toEqual(first);
    // A chain row older than the rescanned window survives.
    const older: ActivityEntry = { ...attackEntry, id: "older", blockNumber: 5n, blockTimestamp: 1_600_000_000n };
    const seeded = blendWorldEvents([], pageOf([older], 1n, 9n), manifest, ctx);
    const merged = blendWorldEvents(seeded, pageOf([attackEntry], 10n, 14n), manifest, ctx);
    expect(merged.map((event) => event.id).sort()).toEqual(["e-attack", "older"]);
  });

  test("T-blend-2 evicts the oldest beyond MAX_WORLD_ROWS and orders chain before mock on ties", () => {
    let events: WorldChannelEvent[] = [];
    for (let i = 0; i < MAX_WORLD_ROWS + 5; i += 1) {
      events = addWorldEvent(events, { id: `x-${i}`, kind: "join", actor: "handle", message: "m", timestamp: i, source: "mock" });
    }
    expect(events).toHaveLength(MAX_WORLD_ROWS);
    expect(events[0]?.timestamp).toBe(MAX_WORLD_ROWS + 4);
    expect(events.at(-1)?.timestamp).toBe(5);
    const tie = addWorldEvent(
      addWorldEvent([], { id: "m1", kind: "join", actor: "handle", message: "m", timestamp: 100, source: "mock" }),
      { id: "c1", kind: "attack", actor: "a", message: "m", timestamp: 100, source: "chain", blockNumber: 9n },
    );
    expect(tie.map((event) => event.id)).toEqual(["c1", "m1"]);
  });

  test("T-blend-3 keeps explorer links on chain rows only", () => {
    let events = blendWorldEvents([], pageOf([attackEntry], 10n, 10n), manifest, ctx);
    for (const mock of generateMockEvents(1, 3)) events = addWorldEvent(events, mock);
    expect(events.find((event) => event.source === "chain")?.explorerUrl).toBe(`https://explorer.example/tx/${commonBase.transactionHash}`);
    for (const event of events.filter((event) => event.source === "mock")) expect(event.explorerUrl).toBeUndefined();
    expect(events.some((event) => event.source === "chain")).toBe(true);
  });
});

test("T-fb-1 selectMode maps deployment state to a fallback mode", () => {
  expect(selectMode({ live: false, realErrored: false })).toBe("mock-only");
  expect(selectMode({ live: true, chainId: ROBINHOOD_TESTNET_CHAIN_ID, realErrored: false })).toBe("mock-only");
  expect(selectMode({ live: true, chainId: 84_532, realErrored: false })).toBe("blended");
  expect(selectMode({ live: true, chainId: 84_532, realErrored: true })).toBe("blended-degraded");
});
