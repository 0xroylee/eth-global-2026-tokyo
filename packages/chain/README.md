# Boss Pool chain SDK

`@boss-pool/chain` is a browser-safe viem SDK for local chain `31337`, Base Sepolia `84532`, and historical Robinhood testnet `46630`. It uses generated Foundry ABIs and pinned Router/Hook creation bytecode. Standalone round deployment and maker administration remain CLI operations. The Base Sepolia deployment manifest selects the corrected Boss Factory and its discovery block. The original Factory remains historical and incompatible with the current bundled build.

The attack currency is named **Attack Token** in the UI and documentation. SDK fields such as `royBought`, `roySpent`, `royRefunded`, `minRoyOut`, and `royBalance`, plus the manifest key `roy` and contract `RoyToken`, retain their existing names for deployment compatibility. All refer to Attack Token. See [domain language](../../CONTEXT.md).


Use `createLocalPublicClient` and `fetchLocalDeployment` for Anvil. Use `createBaseSepoliaPublicClient` and `fetchBaseSepoliaDeployment` for Base Sepolia. Use the corresponding `createRobinhoodPublicClient` and `fetchRobinhoodDeployment` exports only to inspect the historical Robinhood deployment. Public deployment manifests omit RPC URLs. Pass the endpoint separately to the client.

## Coverage

The SDK wraps the agreed player journey. It does not provide a helper for every Solidity function.

| SDK method | Purpose |
| --- | --- |
| `readRound()` | Read round status, stage HP, reserves, prize and redemption totals |
| `readPlayer(account)` | Read balances, allowances, participation and claim eligibility |
| `readState(account?)` | Read round and optional player state at the same block |
| `readActivity(options?)` | Read bounded, confirmed logs for the verified Boss Pool deployment, optionally filtered by an event participant |
| `quoteAttack({ maxMockUSD, ... })` | Public quote before wallet connection or approval |
| `getApproval(action, account)` | Inspect the fixed token/spender pair and allowance |
| `approve(action)` | Request unlimited allowance when the existing allowance is insufficient |
| `prepareAttack(quote)` | Validate and simulate the accepted quote without submitting |
| `attack(quote)` | Revalidate, simulate and submit the two-hop attack |
| `previewReward(hpAmount, account?)` | Calculate the post-defeat payout from held BossHP or Factory reward credit |
| `claimReward(hpAmount)` | Redeem standalone BossHP or consume Factory reward credit for the payout |
| `transferBossHP(recipient, amount)` | Transfer purchased tokens; only standalone BossHP transfers carry reward rights |
| `claimVictoryNFT()` | Claim the separate participation NFT after defeat |
| `faucetMockUSD(amount)` | Mint test MockUSD to the connected account |
| `resumePending(request)` | Recover a receipt without resubmitting a transaction |
| `withWallet(walletClient)` | Bind a wallet to the verified deployment |

Deployment verification and network/manifest helpers are package exports rather than SDK instance methods. The complete argument and return types are exported from [the package entry point](src/index.ts).

Maker setup (`setHook`, `setMinter`, `seedSupplyPool`, `fundPrize`, `activate`), lifecycle calls (`expire`, `refundExpiredPrize`), and other standard ERC-20/ERC-721 operations have no dedicated player SDK wrapper. Use the existing deployment scripts or the exported generated ABIs with viem; caller permissions still apply. Hook callbacks and stage transitions are invoked by the protocol, not by the frontend. See the [contract usage guide](../../docs/contract-usage.md) for those boundaries.

`createBossFactorySdk` supports token metadata and balance reads, launch quotes, exact token-allowance checks and approvals, and a simulated launch transaction. It verifies that the generated Router and Hook bytecode match the Factory's pinned hashes, mines the v4 Hook salt off chain, and validates the `BossLaunched` event from the confirmed receipt. The creator supplies the deployed Factory address.

```ts
import { createBossFactorySdk, parseUnits, type FactoryPendingOperation } from "@boss-pool/chain";

const factorySdk = createBossFactorySdk({ publicClient, factory: factoryAddress });
const config = {
  token,
  tokenAllocation: parseUnits("1000000", memeDecimals),
  prizeBps: 1_000,
  volumeTargetMockUSD: parseUnits("6000", 6),
  deadline: BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60),
  maxAttackTokenPerMockUSDX128: 0n,
};
const quote = await factorySdk.quoteLaunch(config);
const acceptedConfig = { ...config, maxAttackTokenPerMockUSDX128: quote.maxRoyPerMockUSDX128 };
const writer = factorySdk.withWallet(walletClient);
// Browser example: save each submitted request before the SDK waits for its receipt.
const onSubmitted = (operation: FactoryPendingOperation) => {
  localStorage.setItem("factory.pending", JSON.stringify(operation));
};
await writer.approveToken(token, config.tokenAllocation, onSubmitted);
const launched = await writer.launchBoss(acceptedConfig, undefined, onSubmitted);
localStorage.removeItem("factory.pending");
```

Before quotes, approvals, or launches, the Factory SDK checks that its generated Router and Hook creation code matches the configured Factory hashes. The launch flow then derives the hook init code from the accepted frozen rate, mines a permission-correct CREATE2 salt, simulates the launch, and validates the `BossLaunched` event from the confirmed receipt. The Factory separately checks the live supply rate against the accepted bound. Supply-price changes within that bound do not invalidate the mined address.

`checkFactoryBuild()` is a public read that returns `compatible`, `incompatible`, or `not-deployed`. An incompatible result includes the actual and expected creation-code hashes. RPC failures throw. Use this result to explain unavailable launch actions; saved receipt recovery remains available independently of build compatibility.

`approveToken` and `launchBoss` accept an `onSubmitted` callback. Persist its JSON-safe `FactoryPendingOperation` synchronously. `resumeOperation(operation)` checks the saved transaction without sending another one and works with a public SDK client. A receipt timeout raises `FactoryOperationPendingError` and keeps the request unresolved. The app must retain its write lock until a validated success, a proven revert, or a different/cancelled replacement. RPC errors and mismatched successful receipts do not authorize a retry. Replacement transactions must match the sender, destination, calldata, value, chain, and expected events; launch recovery also checks the boss ID and configuration.

The web app's root `FactoryOperationProvider` holds the lock through preparation and navigation, including zero-reset approval followed by the selected allowance. Recovery becomes available after the original caller releases ownership. Submitted requests and confirmed launch results survive a reload. A browser refresh before the wallet returns a transaction hash cannot be reconciled by hash.

Amounts use token base units as `bigint`: MockUSD has 6 decimals; Attack Token and standalone BossHP have 18. Factory MEME uses its actual ERC-20 decimals. Stage indices are zero-based. There is no enrollment or entry-NFT action in the current contracts.


## Verify a deployment and read state

Choose the RPC endpoint separately from the address manifest. The public testnet manifest intentionally contains no RPC URL.

```ts
import {
  createLocalPublicClient,
  createBossPoolSdk,
  fetchLocalDeployment,
  verifyDeployment,
} from "@boss-pool/chain";

const manifest = await fetchLocalDeployment();
const publicClient = createLocalPublicClient(manifest);
const deployment = await verifyDeployment(publicClient, manifest);
const sdk = createBossPoolSdk({ publicClient, deployment });

const { round, player } = await sdk.readState("0x0000000000000000000000000000000000000001");
console.log(round.status, round.currentStage, round.bossCurrentSqrtPriceX96, player?.mockUSDBalance);
```

`verifyDeployment` checks the chain, successful Router creation receipt and block, contract code, and Router/Hook/token/PoolManager wiring. It does not require an Active, untouched, or unexpired encounter, so it can verify completed and expired rounds. The resulting verified object snapshots and freezes the manifest addresses.

### Select a boss by Hook address

`getDefaultBossHook(manifest)` returns the configured `defaultBossHook`, falling back to the standalone `addresses.hook` for older and local manifests. Local standalone manifests keep their direct-creation proof. The live Base Sepolia manifest instead contains the current Factory encounter and its launch proof.

`resolveBossDeployment(publicClient, baseManifest, hookAddress)` resolves either the configured standalone demo or a boss launched by the configured Factory. Factory discovery starts at `bossFactoryDeployedAtBlock`, which must accompany `bossFactory` in the base manifest. It verifies launch provenance and contract wiring before returning a deployment usable by `createBossPoolSdk`. Launch origin may be the current Factory or an explicitly trusted previous Factory with a matching recorded deployment block; it is independent of which Factory handles new launches.

```ts
import { createBossPoolSdk, resolveBossDeployment } from "@boss-pool/chain";

const deployment = await resolveBossDeployment(publicClient, baseManifest, hookAddress);
const sdk = createBossPoolSdk({ publicClient, deployment });
const { round, player } = await sdk.readState(account);
```

Use chain ID and Hook address as the encounter identity. A quote, approval spender, or recovered transaction from one boss cannot be used for another boss, including when both sell the same MEME token.

Round state exposes the encounter mode and HP/reward-token metadata. Factory state also exposes stage volume and volume targets; player state includes `rewardCredit`. A Factory claim consumes that credit and pays the configured reward token without surrendering MEME or requiring a claim-token approval. Standalone redemption keeps its BossHP allowance and custody requirements.

Skip `getApproval({ kind: "claimReward", ... })` for Factory encounters; it throws `APPROVAL_NOT_REQUIRED`. Preview the amount against the connected account's credit, then call `claimReward` directly.

`readRound`, `readPlayer`, and `readState` pin their contract reads to one block and retry a reproduced unsupported-block response at that same block a bounded number of times. Amounts are `bigint`; stages remain zero-based. `bossCurrentSqrtPriceX96` reads the current Hook price. The deprecated `bossInitialSqrtPriceX96` field is retained only as a compatibility alias for that mutable value.

## Read wallet activity

`sdk.readActivity()` scans the verified Router, Hook, MockUSD, ROY, BossHP, and BossCollectibles emitters using their generated ABIs. It returns typed event entries with block timestamp, block hash, transaction hash/index, log index, and a repeatable identity. This is the event history for this deployment, not an index of every transaction or method call; functions that emit no supported event are not represented. The historical Robinhood deployment is rejected because its enrollment-era event schema is not supported by the current ABI.

The default start block is the manifest's recorded Router creation block. Supply `fromBlock: 0n` to include earlier token constructor and setup logs. The first call pins an upper bound to the observed head (or the provided `toBlock`), then scans at most `maxBlocks` per call. Continue with `nextCursor`, including when a wallet-filtered page has no matches:

```ts
let page = await sdk.readActivity({ wallet: account, fromBlock: 0n, maxBlocks: 1_000 });
consume(page.entries);
while (page.nextCursor) {
  page = await sdk.readActivity({ cursor: page.nextCursor });
  consume(page.entries);
}
// true means this selected event scope was scanned through the pinned block.
console.log(page.completeThroughSnapshot, page.snapshotBlockNumber, page.snapshotBlockHash);
```

The cursor binds the deployment, wallet filter, requested range, page size, and snapshot block hash. The SDK checks that hash before and after each page and checks the canonical block hash for returned logs. Restart the scan if the cursor reports a changed snapshot. The observed head is provisional, not finalized; `completeThroughSnapshot` means the selected emitter/event scope was scanned through that observed block, not that the chain can never reorganize.

A wallet filter matches decoded event participants: player/maker fields, token transfer endpoints, or approval owner/spender fields. It does not infer the transaction signer. Lifecycle events with no wallet participant appear only in the unfiltered feed. `AttackExecuted` is the single authoritative damage entry; `AttackRecorded` is returned as corroboration only, and refill or token-transfer entries carry no additional damage. ERC-20 and ERC-721 transfers use the ABI for their verified emitter so their shared event signature is decoded correctly.

Replay the checked-in or a fresh completed local exercise journal with the read-only smoke command. It compares the journal's deployment identity and successful receipts with the supplied manifest, derives the scan end and expected actions from the journal, and checks global and per-wallet pages plus cursor replay guards:

```sh
ACTIVITY_MANIFEST_PATH=/path/to/local.json \
LOCAL_RPC_URL=http://127.0.0.1:8552 \
ACTIVITY_JOURNAL_PATH=/path/to/completed-exercise.json \
bun run local:activity-smoke
```

`ACTIVITY_JOURNAL_PATH` defaults to `docs/evidence/local-sdk-direct-attack.json`; keep the manifest and journal from the same deployment and completed exercise.

Verified against the existing local two-wallet journey: 69 supported events, four authoritative attacks, wallet-filtered transfer/claim/NFT history, and cursor guards. See the [activity verification record](../../docs/evidence/wallet-activity-verification.json). This verification reads receipts and logs only.

## Public quote before approval

The Router quote uses the real two-hop route and any reserve-funded stage transition inside a reverting simulation frame. It requires no account, allowance, or player balance. It does not change pool state.

```ts
const quote = await sdk.quoteAttack({
  maxMockUSD: 50n * 10n ** 6n,
  // stage defaults to the current zero-based stage
});
console.log({
  spent: quote.mockUSDSpent,
  refunded: quote.mockUSDRefunded,
  royBought: quote.royBought,
  roySpent: quote.roySpent,
  bossHPOut: quote.bossHPOut,
  minBossHPOut: quote.minBossHPOut,
  stageCleared: quote.stageCleared,
});
```

The quote carries its chain, deployment, account (when supplied), stage, source block, expiry, input cap, and the minimum outputs derived from the tolerance the caller selected. A changed stage, deployment, account, expiry, or failed final simulation requires a fresh quote. The SDK never lowers accepted minimum outputs.

## Wallet actions

The app creates a viem `WalletClient` from its selected EIP-1193 account and binds it with `sdk.withWallet(walletClient)`. The SDK checks chain and selected account before each write and supplies the verified deployment chain to viem. Local `Account` objects stay intact so local signing continues to work. The historical Robinhood deployment is read-only because its contracts require the removed enrollment flow.

```ts
const playerSdk = sdk.withWallet(walletClient);

async function submitQuotedAttack() {
  const approval = await playerSdk.getApproval(
    { kind: "attack", maxMockUSD: quote.maxMockUSD },
    selectedAccount,
  );
  // Show approval.tokenAddress and approval.spenderAddress before prompting.
  const approvalTx = await playerSdk.approve({ kind: "attack", maxMockUSD: quote.maxMockUSD });
  if ("request" in approvalTx) {
    // Persist approvalTx.request before waiting so it can be recovered.
    const result = await approvalTx.wait();
    if (result.status === "unresolved") return result;
  }
  const attackTx = await playerSdk.attack(quote);
  // Persist attackTx.hash and attackTx.request before waiting.
  return attackTx.wait();
}

const result = await submitQuotedAttack();
// If unresolved, keep the saved request and resume receipt checking later.

```

Approvals use the fixed map and request unlimited allowances: attack MockUSD to Router and reward BossHP to Hook. Existing sufficient allowance skips the write. Attacks have no Hook approval, entry fee, starter-Attack Token grant, or entry NFT. `attack` performs an authenticated Router simulation after approval and before sending the unchanged accepted floors.

`transferBossHP`, `claimReward`, `claimVictoryNFT`, and `faucetMockUSD` follow the same submitted-hash then `wait()` pattern. `previewReward` uses the frozen original prize and eligible BossHP denominator after defeat. A token transferee can claim without attacking; optional victory-NFT eligibility depends on that account's attack history.

Each pending operation exposes a JSON-safe `request` with transaction hash, chain, account, target, calldata, and operation kind. `resumePending(request)` recovers a pending result without resubmitting. Receipt and replacement checks require the requested account, target, calldata, zero value, and expected contract events. A timeout returns `status: "unresolved"`; it does not mean the transaction failed.

Both SDKs support direct transactions and Base Sepolia relayed approvals and actions through MetaMask's [DelegationManager v1.3.0](https://github.com/MetaMask/delegation-framework/blob/v1.3.0/documents/Deployments.md). The relayed path requires one delegation redemption in single-call, revert-on-failure mode. Validation checks the root delegator and exact inner target, zero value, and calldata, then validates the expected contract events. Other wallet wrappers and batches remain unsupported. Existing saved requests use the same recovery path without another wallet submission.

Use `DecodedContractEvent` results instead of decoding receipt logs in UI code. Logs are filtered to verified contract emitters and include the transaction hash and log index for effect deduplication. Broad contract errors remain unchanged; the SDK only maps known stale quote, stage, expiry, and slippage conditions to requote results.

`faucetMockUSD` mints the configured deployment's test-only MockUSD on the local and Base Sepolia deployments. The historical Robinhood contracts expose a faucet, but SDK writes on that network are disabled. MockUSD is not a real asset. Never place private keys, Bun/Node imports, or environment loading in browser imports.

## Compatibility exports

`createLocalPublicClient`, `fetchLocalDeployment`, `parseLocalDeployment`, `verifyLocalDeployment`, and `readLocalRound` remain for the existing local-only app while it migrates. New code should use the general deployment and SDK APIs above. Generated ABIs are maintained by `bun run abi:export`; do not handwrite duplicates.
