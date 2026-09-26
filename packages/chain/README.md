# Boss Pool chain SDK

`@boss-pool/chain` is a browser-safe viem SDK for local chain `31337`, Base Sepolia `84532`, and historical Robinhood testnet `46630`. It uses the generated Foundry ABIs in `src/generated/abi.ts`. Deployment, round creation, and maker administration remain CLI operations. No Boss Pool Base Sepolia manifest is published yet.

Use `createLocalPublicClient` and `fetchLocalDeployment` for Anvil. Use `createBaseSepoliaPublicClient` and `fetchBaseSepoliaDeployment` for Base Sepolia. Use the corresponding `createRobinhoodPublicClient` and `fetchRobinhoodDeployment` exports only to inspect the historical Robinhood deployment. Public deployment manifests omit RPC URLs. Pass the endpoint separately to the client.

## Coverage

The SDK wraps the agreed player journey. It does not provide a helper for every Solidity function.

| SDK method | Purpose |
| --- | --- |
| `readRound()` | Read round status, stage HP, reserves, prize and redemption totals |
| `readPlayer(account)` | Read balances, allowances, participation and claim eligibility |
| `readState(account?)` | Read round and optional player state at the same block |
| `quoteAttack({ maxMockUSD, ... })` | Public quote before wallet connection or approval |
| `getApproval(action, account)` | Inspect the fixed token/spender pair and allowance |
| `approve(action)` | Request unlimited allowance when the existing allowance is insufficient |
| `prepareAttack(quote)` | Validate and simulate the accepted quote without submitting |
| `attack(quote)` | Revalidate, simulate and submit the two-hop attack |
| `previewReward(hpAmount, account?)` | Calculate the post-defeat MockUSD payout |
| `claimReward(hpAmount)` | Surrender BossHP and claim the payout |
| `transferBossHP(recipient, amount)` | Transfer held reward rights |
| `claimVictoryNFT()` | Claim the separate participation NFT after defeat |
| `faucetMockUSD(amount)` | Mint test MockUSD to the connected account |
| `resumePending(request)` | Recover a receipt without resubmitting a transaction |
| `withWallet(walletClient)` | Bind a wallet to the verified deployment |

Deployment verification and network/manifest helpers are package exports rather than SDK instance methods. The complete argument and return types are exported from [the package entry point](src/index.ts).

Maker setup (`setHook`, `setMinter`, `seedSupplyPool`, `fundPrize`, `activate`), lifecycle calls (`expire`, `refundExpiredPrize`), and other standard ERC-20/ERC-721 operations have no dedicated player SDK wrapper. Use the existing deployment scripts or the exported generated ABIs with viem; caller permissions still apply. Hook callbacks and stage transitions are invoked by the protocol, not by the frontend. See the [contract usage guide](../../docs/contract-usage.md) for those boundaries.

Amounts use token base units as `bigint`: MockUSD has 6 decimals; ROY and BossHP have 18. Stage indices are zero-based. There is no enrollment or entry-NFT action in the current contracts.

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

`readRound`, `readPlayer`, and `readState` pin their contract reads to one block and retry a reproduced unsupported-block response at that same block a bounded number of times. Amounts are `bigint`; stages remain zero-based. `bossCurrentSqrtPriceX96` reads the current Hook price. The deprecated `bossInitialSqrtPriceX96` field is retained only as a compatibility alias for that mutable value.

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

Approvals use the fixed map and request unlimited allowances: attack MockUSD to Router and reward BossHP to Hook. Existing sufficient allowance skips the write. Attacks have no Hook approval, entry fee, starter-ROY grant, or entry NFT. `attack` performs an authenticated Router simulation after approval and before sending the unchanged accepted floors.

`transferBossHP`, `claimReward`, `claimVictoryNFT`, and `faucetMockUSD` follow the same submitted-hash then `wait()` pattern. `previewReward` uses the frozen original prize and eligible BossHP denominator after defeat. A token transferee can claim without attacking; optional victory-NFT eligibility depends on that account's attack history.

Each pending operation exposes a JSON-safe `request` with transaction hash, chain, account, target, calldata, and operation kind. `resumePending(request)` recovers a pending result without resubmitting. Viem replacement detection accepts only the same sender, target, calldata, zero value, and expected contract events. A timeout returns `status: "unresolved"`; it does not mean the transaction failed.

Use `DecodedContractEvent` results instead of decoding receipt logs in UI code. Logs are filtered to verified contract emitters and include the transaction hash and log index for effect deduplication. Broad contract errors remain unchanged; the SDK only maps known stale quote, stage, expiry, and slippage conditions to requote results.

`faucetMockUSD` mints the configured deployment's test-only MockUSD. It is usable on the current local deployment. The historical Robinhood contracts expose a faucet, but SDK writes on that network are disabled. Base Sepolia has no Boss Pool manifest yet. MockUSD is not a real asset. Never place private keys, Bun/Node imports, or environment loading in browser imports.

## Compatibility exports

`createLocalPublicClient`, `fetchLocalDeployment`, `parseLocalDeployment`, `verifyLocalDeployment`, and `readLocalRound` remain for the existing local-only app while it migrates. New code should use the general deployment and SDK APIs above. Generated ABIs are maintained by `bun run abi:export`; do not handwrite duplicates.
