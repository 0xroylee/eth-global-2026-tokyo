import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createBossPoolSdk,
  createLocalPublicClient,
  parseLocalDeployment,
  verifyDeployment,
  type ActivityEntry,
  type Address,
  type DecodedContractEvent,
  type PendingRequest,
} from "@boss-pool/chain";

type JournalTransaction = {
  from: Address;
  status: string;
  confirmedHash: `0x${string}`;
  blockNumber: string;
  request: PendingRequest;
};
type JournalCheckpoint = {
  name: string;
  blockNumber: string;
  finalEligibleHP: string;
  paidPrize: string;
};
type Journal = {
  status: string;
  chainId: number;
  deploymentBlock: string;
  deploymentTxHash: `0x${string}`;
  addresses: Record<string, Address>;
  players: Record<string, Address>;
  transactions: JournalTransaction[];
  checkpoints: JournalCheckpoint[];
};

const manifestPath = process.env.ACTIVITY_MANIFEST_PATH;
const journalPath = process.env.ACTIVITY_JOURNAL_PATH ?? "docs/evidence/local-sdk-direct-attack.json";
const rpcUrl = process.env.LOCAL_RPC_URL;
if (!manifestPath || !rpcUrl) {
  throw new Error("Set ACTIVITY_MANIFEST_PATH and LOCAL_RPC_URL; ACTIVITY_JOURNAL_PATH defaults to the published local exercise journal.");
}

const [manifestText, journalText] = await Promise.all([
  readFile(manifestPath, "utf8"),
  readFile(journalPath, "utf8"),
]);
const manifest = parseLocalDeployment(JSON.parse(manifestText) as unknown);
const journal = JSON.parse(journalText) as Journal;
assert.equal(journal.status, "completed", "activity check requires a completed exercise journal");
assert.equal(journal.chainId, manifest.chainId);
assert.equal(journal.deploymentTxHash.toLowerCase(), manifest.deploymentTxHash.toLowerCase());
assert.equal(Number(journal.deploymentBlock), manifest.deployedAtBlock);
for (const key of ["hook", "router", "bossHP", "roy", "mockUSD", "collectibles", "poolManager"] as const) {
  assert.equal(journal.addresses[key]?.toLowerCase(), manifest.addresses[key].toLowerCase(), `journal ${key} address must match the supplied manifest`);
}
assert.ok(journal.transactions.length > 0, "exercise journal has no transactions");
assert.ok(journal.transactions.every((tx) => tx.status === "success"), "exercise journal contains an unsuccessful transaction");
assert.ok(journal.transactions.every((tx) => tx.request.chainId === journal.chainId && tx.from.toLowerCase() === tx.request.account.toLowerCase()));

const finalCheckpoint = journal.checkpoints.find((checkpoint) => checkpoint.name === "final") ?? journal.checkpoints[journal.checkpoints.length - 1];
if (!finalCheckpoint) throw new Error("Exercise journal has no final checkpoint.");
const toBlock = BigInt(finalCheckpoint.blockNumber);
assert.ok(toBlock > 0n, "final exercise block must be after genesis");
const fromBlock = 0n;
const maxBlocks = Math.min(10_000, Math.max(1, Math.ceil(Number(toBlock + 1n) / 6)));
const walletA = journal.players.A;
const walletB = journal.players.B;
if (!walletA || !walletB) throw new Error("Exercise journal must record players A and B.");

const publicClient = createLocalPublicClient(rpcUrl);
const deployment = await verifyDeployment(publicClient, manifest);
const sdk = createBossPoolSdk({ publicClient, deployment });

const [all, byA, byB] = await Promise.all([
  scan(),
  scan(walletA),
  scan(walletB),
]);
const firstA = await sdk.readActivity({ wallet: walletA, fromBlock, toBlock, maxBlocks });
const firstCursor = firstA.nextCursor;
if (!firstCursor) throw new Error("Test journal range must span multiple bounded activity pages.");
const cursorOnlyPage = await sdk.readActivity({ cursor: firstCursor });
assert.equal(cursorOnlyPage.wallet, walletA.toLowerCase(), "cursor-only resume preserves its wallet filter");
assert.ok(cursorOnlyPage.scannedFromBlock > firstA.scannedToBlock);
await assert.rejects(
  sdk.readActivity({ cursor: firstCursor, wallet: walletB }),
  /cursor does not match/,
  "a bound cursor cannot switch wallets",
);
const changedHash = (firstCursor.snapshotBlockHash === `0x${"00".repeat(32)}` ? `0x${"11".repeat(32)}` : `0x${"00".repeat(32)}`) as `0x${string}`;
await assert.rejects(
  sdk.readActivity({ cursor: { ...firstCursor, snapshotBlockHash: changedHash } }),
  /snapshot changed or was reorganized/,
  "a cursor cannot continue against a changed snapshot",
);
await assert.rejects(
  sdk.readActivity({ cursor: { ...firstCursor, wallet: "not-an-address" as Address } }),
  /cursor is malformed/,
  "a malformed cursor wallet is rejected",
);

const expectedTransactions = journal.transactions;
const receiptEvents: { transaction: JournalTransaction; events: readonly DecodedContractEvent[] }[] = [];
for (const transaction of expectedTransactions) {
  const recovered = await sdk.resumePending(transaction.request).wait();
  if (recovered.status !== "confirmed") throw new Error(`Journal transaction ${transaction.confirmedHash} has no confirmed receipt.`);
  assert.equal(recovered.hash.toLowerCase(), transaction.confirmedHash.toLowerCase());
  assert.equal(recovered.receipt.status, "success");
  assert.equal(recovered.receipt.blockNumber, BigInt(transaction.blockNumber));
  receiptEvents.push({ transaction, events: recovered.result.events });
}

for (const recovered of receiptEvents) {
  for (const event of recovered.events) {
    const entry = activityForLog(all.entries, event);
    assert.equal(eventName(entry), event.eventName, `${event.eventName} appears at the receipt's log position`);
  }
}

const attackTransactions = expectedTransactions.filter((transaction) => transaction.request.kind === "attack");
const attackReceipts = receiptEvents.flatMap(({ events }) => events.filter((event) => event.eventName === "AttackExecuted"));
const attackRecords = all.entries.filter((entry) => entry.kind === "attack-recorded");
const attacks = all.entries.filter((entry): entry is Extract<ActivityEntry, { kind: "attack" }> => entry.kind === "attack");
assert.equal(attackReceipts.length, attackTransactions.length);
assert.equal(attacks.length, attackTransactions.length, "AttackExecuted is the only damage-bearing activity kind");
assert.equal(attackRecords.length, attackTransactions.length, "AttackRecorded is a separate corroborating event");
assert.ok(attackRecords.every((entry) => entry.authority === "corroborating-only"));
assert.equal(sum(attacks.map((entry) => entry.bossHPReceived)), sum(attackReceipts.map((event) => {
  if (event.eventName !== "AttackExecuted") throw new Error("Unexpected attack receipt event.");
  return event.args.bossHPReceived;
})));
assert.equal(sum(attacks.map((entry) => entry.bossHPReceived)), BigInt(finalCheckpoint.finalEligibleHP));
assert.equal(sum(attackRecords.map((entry) => entry.bossHPOut)), sum(attacks.map((entry) => entry.bossHPReceived)));
assert.deepEqual(countByPlayer(attacks), countTransactionsByAccount(attackTransactions));
assert.deepEqual(countByPlayer(byA.entries.filter((entry): entry is Extract<ActivityEntry, { kind: "attack" }> => entry.kind === "attack")), {
  [walletA.toLowerCase()]: attackTransactions.filter((transaction) => transaction.request.account.toLowerCase() === walletA.toLowerCase()).length,
});
assert.deepEqual(countByPlayer(byB.entries.filter((entry): entry is Extract<ActivityEntry, { kind: "attack" }> => entry.kind === "attack")), {
  [walletB.toLowerCase()]: attackTransactions.filter((transaction) => transaction.request.account.toLowerCase() === walletB.toLowerCase()).length,
});

const refillReceipts = receiptEvents.flatMap(({ events }) => events.filter((event) => event.eventName === "StageRefilled"));
assert.equal(all.entries.filter((entry) => entry.kind === "stage-refilled").length, refillReceipts.length);
assert.ok(byA.entries.every((entry) => entry.kind !== "stage-refilled"));
assert.ok(byB.entries.every((entry) => entry.kind !== "stage-refilled"));

const rewardReceipts = receiptEvents.flatMap(({ events }) => events.filter((event) => event.eventName === "RewardClaimed"));
const rewardEntries = all.entries.filter((entry) => entry.kind === "reward-claimed");
assert.equal(rewardEntries.length, expectedTransactions.filter((transaction) => transaction.request.kind === "claimReward").length);
assert.equal(sum(rewardReceipts.map((event) => {
  if (event.eventName !== "RewardClaimed") throw new Error("Unexpected reward receipt event.");
  return event.args.mockUSDOut;
})), BigInt(finalCheckpoint.paidPrize));
assert.equal(byA.entries.filter((entry) => entry.kind === "reward-claimed").length,
  rewardReceipts.filter((event) => event.eventName === "RewardClaimed" && event.args.player.toLowerCase() === walletA.toLowerCase()).length);
assert.equal(byB.entries.filter((entry) => entry.kind === "reward-claimed").length,
  rewardReceipts.filter((event) => event.eventName === "RewardClaimed" && event.args.player.toLowerCase() === walletB.toLowerCase()).length);

const nftReceipts = receiptEvents.flatMap(({ events }) => events.filter((event) => event.eventName === "VictoryNFTClaimed"));
const nftClaims = all.entries.filter((entry) => entry.kind === "victory-nft-claimed");
const nftTransfers = all.entries.filter((entry): entry is Extract<ActivityEntry, { kind: "nft-transfer" }> => entry.kind === "nft-transfer");
assert.equal(nftClaims.length, nftReceipts.length);
for (const event of nftReceipts) {
  if (event.eventName !== "VictoryNFTClaimed") throw new Error("Unexpected NFT receipt event.");
  assert.ok(nftClaims.some((entry) => entry.player.toLowerCase() === event.args.player.toLowerCase() && entry.tokenId === event.args.tokenId));
  assert.ok(nftTransfers.some((entry) => entry.from === "0x0000000000000000000000000000000000000000" &&
    entry.to.toLowerCase() === event.args.player.toLowerCase() && entry.tokenId === event.args.tokenId));
}
assert.equal(byA.entries.filter((entry) => entry.kind === "victory-nft-claimed").length,
  nftReceipts.filter((event) => event.eventName === "VictoryNFTClaimed" && event.args.player.toLowerCase() === walletA.toLowerCase()).length);
assert.equal(byB.entries.filter((entry) => entry.kind === "victory-nft-claimed").length,
  nftReceipts.filter((event) => event.eventName === "VictoryNFTClaimed" && event.args.player.toLowerCase() === walletB.toLowerCase()).length);

const hpTransferTx = receiptEvents.find(({ transaction }) => transaction.request.kind === "transferBossHP");
if (hpTransferTx) {
  const transfer = hpTransferTx.events.find((event) => event.eventName === "Transfer");
  if (!transfer || transfer.eventName !== "Transfer") throw new Error("Journaled BossHP transfer has no Transfer receipt event.");
  const transferActivity = activityForLog(all.entries, transfer);
  assert.ok(transferActivity.kind === "token-transfer" && transferActivity.token === "BossHP");
  assert.ok(byA.entries.some((entry) => entry.id === transferActivity.id), "BossHP recipient filter includes the transfer");
  assert.ok(byB.entries.some((entry) => entry.id === transferActivity.id), "BossHP sender filter includes the transfer");
}

const emptyWallet = (process.env.ACTIVITY_EMPTY_WALLET ?? "0x000000000000000000000000000000000000dEaD") as Address;
assert.ok(emptyWallet.toLowerCase() !== walletA.toLowerCase() && emptyWallet.toLowerCase() !== walletB.toLowerCase());
const emptyFirst = await sdk.readActivity({ wallet: emptyWallet, fromBlock, toBlock, maxBlocks });
assert.equal(emptyFirst.entries.length, 0, "the selected empty address has no activity in the journal range");
if (!emptyFirst.nextCursor) throw new Error("Activity pagination should continue past the first empty-wallet page.");
const emptyNext = await sdk.readActivity({ cursor: emptyFirst.nextCursor });
assert.equal(emptyNext.entries.length, 0);
assert.equal(emptyNext.wallet, emptyWallet.toLowerCase());
assert.ok(emptyNext.scannedFromBlock > emptyFirst.scannedToBlock, "empty wallet pages still advance the block cursor");

console.log(JSON.stringify({
  chainId: deployment.chainId,
  journalPath,
  fromBlock: fromBlock.toString(),
  toBlock: toBlock.toString(),
  snapshotBlockHash: all.snapshotBlockHash,
  supportedEntries: all.entries.length,
  successfulExerciseTransactions: expectedTransactions.length,
  authoritativeAttacks: attacks.length,
  corroboratingAttackRecords: attackRecords.length,
  stageRefills: refillReceipts.length,
  pages: all.pageCount,
  emptyWalletCursor: "passed",
  cursorReorgWalletAndShapeGuards: "passed",
}, null, 2));

async function scan(wallet?: Address) {
  const options = { fromBlock, toBlock, maxBlocks, ...(wallet ? { wallet } : {}) };
  const first = await sdk.readActivity(options);
  const repeatedFirst = await sdk.readActivity(options);
  assert.deepEqual(ids(repeatedFirst.entries), ids(first.entries), "replaying a range must return the same page identities");
  assert.equal(first.snapshotBlockHash, repeatedFirst.snapshotBlockHash);
  const entries = [...first.entries];
  let next = first.nextCursor;
  let pageCount = 1;
  if (next) {
    const replay = await sdk.readActivity({ cursor: next });
    const continuation = await sdk.readActivity({ cursor: next });
    assert.deepEqual(ids(replay.entries), ids(continuation.entries), "replaying a cursor must not skip or duplicate logs");
    assert.equal(replay.snapshotBlockHash, first.snapshotBlockHash);
    if (wallet) assert.equal(replay.wallet, wallet.toLowerCase());
    entries.push(...replay.entries);
    next = replay.nextCursor;
    pageCount += 1;
  }
  while (next) {
    const page = await sdk.readActivity({ cursor: next });
    assert.equal(page.snapshotBlockHash, first.snapshotBlockHash);
    assert.equal(page.scannedFromBlock, BigInt(next.nextFromBlock));
    assert.ok(page.scannedToBlock >= page.scannedFromBlock);
    assert.equal(page.completeThroughSnapshot, page.nextCursor === undefined);
    entries.push(...page.entries);
    next = page.nextCursor;
    pageCount += 1;
  }
  assert.equal(pageCount, Math.ceil(Number(toBlock + 1n) / maxBlocks));
  assert.equal(new Set(ids(entries)).size, entries.length, "pages must not duplicate event identities");
  return { entries, pageCount, snapshotBlockHash: first.snapshotBlockHash };
}

function activityForLog(entries: readonly ActivityEntry[], event: DecodedContractEvent): ActivityEntry {
  const matches = entries.filter((entry) => entry.transactionHash.toLowerCase() === event.transactionHash.toLowerCase() &&
    entry.address.toLowerCase() === event.address.toLowerCase() && entry.logIndex === event.logIndex);
  assert.equal(matches.length, 1, `${event.eventName} at ${event.transactionHash}:${event.logIndex} is indexed once`);
  return matches[0]!;
}

function eventName(entry: ActivityEntry): string {
  switch (entry.kind) {
    case "attack": return "AttackExecuted";
    case "attack-recorded": return "AttackRecorded";
    case "stage-cleared": return "StageCleared";
    case "stage-refilled": return "StageRefilled";
    case "stage-activated": return "StageActivated";
    case "round-activated": return "RoundActivated";
    case "supply-pool-seeded": return "SupplyPoolSeeded";
    case "boss-defeated": return "BossDefeated";
    case "reward-claimed": return "RewardClaimed";
    case "victory-nft-claimed": return "VictoryNFTClaimed";
    case "round-expired": return "RoundExpired";
    case "prize-funded": return "PrizeFunded";
    case "expired-prize-refunded": return "ExpiredPrizeRefunded";
    case "ownership-transferred": return "OwnershipTransferred";
    case "token-transfer":
    case "nft-transfer": return "Transfer";
    case "token-approval":
    case "nft-approval": return "Approval";
    case "nft-approval-for-all": return "ApprovalForAll";
  }
}

function ids(entries: readonly ActivityEntry[]): string[] {
  return entries.map((entry) => entry.id);
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

function countByPlayer(entries: readonly { player: Address }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const player = entry.player.toLowerCase();
    counts[player] = (counts[player] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function countTransactionsByAccount(transactions: readonly JournalTransaction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const transaction of transactions) {
    const account = transaction.request.account.toLowerCase();
    counts[account] = (counts[account] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}
