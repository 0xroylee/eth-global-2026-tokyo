# Boss Pool chain SDK

`@boss-pool/chain` is a browser-safe viem SDK for the local chain (31337) and Robinhood testnet (46630). It uses the generated Foundry ABIs in `src/generated/abi.ts`. Deployment, round creation, and maker administration remain CLI operations.

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

The Router quote uses the real two-hop route and any reserve-funded stage transition inside a reverting simulation frame. It requires neither an account nor enrollment, allowance, or player balance. It does not change pool state.

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

The app creates a viem `WalletClient` from its selected EIP-1193 account and binds it with `sdk.withWallet(walletClient)`. The SDK checks chain and selected account before each write and supplies the verified deployment chain to viem. Local `Account` objects stay intact so local signing continues to work.

```ts
const playerSdk = sdk.withWallet(walletClient);
const approval = await playerSdk.getApproval(
  { kind: "attack", maxMockUSD: quote.maxMockUSD },
  selectedAccount,
);
// Show approval.token and approval.spender before prompting the wallet.
const approvalTx = await playerSdk.approve({ kind: "attack", maxMockUSD: quote.maxMockUSD });
if ("request" in approvalTx) {
  const result = await approvalTx.wait();
  if (result.status === "unresolved") {
    // Keep the request and resume read-only receipt checking after refresh.
  }
}
const attackTx = await playerSdk.attack(quote);
// Persist attackTx.hash and attackTx.request before waiting.
const attackReceipt = await attackTx.wait();
```

Approvals use the fixed map and request unlimited allowances: enrollment MockUSD to Hook, attack MockUSD to Router, and reward BossHP to Hook. Existing sufficient allowance skips the write. `attack` performs an authenticated Router simulation after approval and before sending the unchanged accepted floors.

`enroll`, `transferBossHP`, `claimReward`, `claimVictoryNFT`, and `faucetMockUSD` follow the same submitted-hash then `wait()` pattern. `previewReward` uses the frozen original prize and eligible BossHP denominator after defeat. A token transferee can claim without enrollment; victory-NFT eligibility still depends on that account's attack history.

Each pending operation exposes a JSON-safe `request` with transaction hash, chain, account, target, calldata, and operation kind. `resumePending(request)` recovers a pending result without resubmitting. Viem replacement detection accepts only the same sender, target, calldata, zero value, and expected contract events. A timeout returns `status: "unresolved"`; it does not mean the transaction failed.

Use `DecodedContractEvent` results instead of decoding receipt logs in UI code. Logs are filtered to verified contract emitters and include the transaction hash and log index for effect deduplication. Broad contract errors remain unchanged; the SDK only maps known stale quote, stage, expiry, and slippage conditions to requote results.

The faucet is available only through the verified local or Robinhood test-token deployment. It mints MockUSD and is not a real asset. Never place private keys, Bun/Node imports, or environment loading in browser imports.

## Compatibility exports

`createLocalPublicClient`, `fetchLocalDeployment`, `parseLocalDeployment`, `verifyLocalDeployment`, and `readLocalRound` remain for the existing local-only app while it migrates. New code should use the general deployment and SDK APIs above. Generated ABIs are maintained by `bun run abi:export`; do not handwrite duplicates.
