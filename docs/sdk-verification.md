# SDK and player-flow verification

Updated 26 September 2026. The current implementation uses the generated contract ABI, the `@boss-pool/chain` SDK, and the Next.js player app. The package API and setup examples live in the [chain SDK guide](../packages/chain/README.md).

The quote contract changes came from `b98b685fadd5`. The SDK implementation is `1802ffd6d812`. The reader retry and UI integration use `4033d7b7818f`; the NFT completion run used that SDK source. The current Robinhood PoolManager is deployed from pinned v4-core source by the team. It is a non-production fixture, not an official Robinhood deployment.

## Local and browser checks

The local suite and SDK journey passed these checks:

- `bun run contracts:test` passed five focused Foundry cases for the HP0 round, HP1 normalized pricing and refill, public quote non-persistence, setup deadlines, and expiry.
- `bun run typecheck` and `bun run web:build` passed.
- The isolated local Anvil SDK journey recorded 18 successful transactions. It compared a public quote made before approval with actual execution, then exercised two wallets through all three stages, both refills, HP transfer and redemption, and both victory NFTs. Its ignored journal is `.scratch/boss-pool-exercise/local-20260926T073451640Z-45689.json`.
- Browser checks showed a public attack quote without a connected wallet and rendered the defeated round. The header network selector changed from Local to Robinhood Testnet with ArrowDown and Enter. The amount field kept native caret movement when ArrowLeft was pressed.

The browser checks did not automate an injected wallet's popup. Use the [manual wallet checklist](#manual-browser-wallet-checklist) to verify connect, network switch, approval, rejection, signing, and receipt recovery.

## Robinhood testnet run

The original SDK gameplay process submitted 16 successful transactions on chain `46630`. It completed enrollment, all three stages and refills, BossHP transfer, and both prize claims. It stopped before the two victory-NFT writes when an RPC returned `Block at number "124485152" could not be found.` The saved gameplay journal therefore has `status: "failed"`, but all 16 recorded transactions succeeded.

The completion run did not redeploy or replay the round. It verified the 16 saved receipts and current defeated state, then submitted the two missing NFT claims. An independent read at block `124495300` confirmed all 18 receipts, both claim flags, and token ownership. These results combine two runs. They are not one uninterrupted 18-transaction run.

| Phase | Result | Evidence |
| --- | --- | --- |
| Gameplay | 16 successful receipts, blocks `124484822` through `124485137` | [Gameplay evidence](evidence/robinhood-sdk-gameplay.json) |
| Player A victory NFT | Token ID `3`, block `124492612` | [Transaction](https://explorer.testnet.chain.robinhood.com/tx/0x05e1f1570ececa16930877913733933a1f3ca006afbd2f86eba932a17ec65f05) |
| Player B victory NFT | Token ID `4`, block `124492657` | [Transaction](https://explorer.testnet.chain.robinhood.com/tx/0xaa31624cd18a6b8bdcf9de5f7532498712478d495bab49593be4f2fdbfb72b43) |
| Completion checks | Two new receipts; all 16 previous receipts rechecked | [NFT completion evidence](evidence/robinhood-sdk-nft-completion.json) |

The final eligible and redeemed BossHP totals both equal `1799999999999999999997` base units. The Hook paid `999999999` of the `1000000000` MockUSD prize base units. BossHP supply and reconciled custody both equal `2000000000000000000000` base units. ROY supply is `100000000000000000000000` base units. The completion evidence records ownership of NFT `3` by Player A and NFT `4` by Player B.

The testnet fixture is Defeated and cannot run another fight. Expiry and prize-refund behavior have local Foundry evidence only. They have no Robinhood testnet receipts.

## Manual browser-wallet checklist

Use a fresh local round for writes. The current testnet round is already Defeated. Keep any test wallet separate from personal funds, and never use an Anvil development key on Robinhood testnet.

1. Open the app with a fresh local deployment and no wallet connected. Confirm that round state and an attack quote load without a wallet prompt.
2. Connect a dedicated test wallet. Confirm that the app shows the selected account and that the active chain matches the selected deployment.
3. Select the other network in the header. Confirm the wallet's network switch request, then test rejection and confirm that the app reports the mismatch without reusing stale player state or quotes.
4. Start enrollment. Confirm the approval prompt names MockUSD, BossHook, and an unlimited allowance. Reject it once and confirm that enrollment does not proceed. Approve it, then confirm enrollment only after its receipt succeeds.
5. Request an attack quote before attack approval. Confirm the quote shows the MockUSD cap, expected stage, outputs, and minimums. Check that the attack approval names MockUSD, BossRouter, and an unlimited allowance. Reject one request and confirm that no confirmed damage appears.
6. Approve and attack. Confirm the app shows pending state after submission and applies damage only after the checked receipt. Change accounts or advance the stage from a second wallet, then confirm that stale quotes require a new quote.
7. Refresh with a pending transaction. Confirm that the saved hash is checked through `resumePending(request)` and the app does not submit the write again.
8. After defeat, confirm that any reward approval names BossHP and BossHook with an unlimited allowance. Redeem BossHP and claim the victory NFT. Confirm that the UI updates from receipt-backed state and keeps reward redemption separate from the participation NFT.
