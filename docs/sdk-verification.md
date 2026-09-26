# SDK and player-flow verification

Updated 26 September 2026. The current implementation uses the generated contract ABI, the `@boss-pool/chain` SDK, and the Next.js player app. The package API and setup examples live in the [chain SDK guide](../packages/chain/README.md).

The active target is Base Sepolia, chain `84532`. Its RPC is reachable, but no Boss Pool manifest or deployment has been verified there. The browser defaults to Base Sepolia and shows a not-deployed state while the manifest is absent. The testnet transactions below are historical Robinhood evidence on chain `46630`; they do not verify Base Sepolia.

The previous quote contract changes came from `b98b685fadd5`; SDK and UI work followed in `1802ffd6d812` and `4033d7b7818f`. Commit `eb213a6` removed enrollment, entry fees, starter ROY, and entry-NFT minting. The direct-attack local journey below tests the current source; the earlier local and Robinhood journeys are historical enrollment-era evidence. The Robinhood PoolManager is team-deployed from pinned v4-core source, not an official deployment.

## Local and browser checks

The direct-attack implementation passed the final gate at commit `3450be71dcac758e39acddeae2664cd0035e7666`:

- Frozen dependency install, contract build and runtime sizes, five focused Foundry cases, generated ABI consistency, TypeScript typecheck, production web build, local read smoke, and the existing map checker all passed.
- The shared local SDK journey completed **14 successful transactions** on chain `31337`, ending at block `54`. It covers public preapproval quotes, direct fresh-wallet attacks, all three stages and both refills, stale quote rejection, refunds, transferable HP redemption, custody, and optional victory NFTs `1` and `2`. No entry fee, starter ROY, or NFT is required for an attack. See the [direct-attack local journal](evidence/local-sdk-direct-attack.json).
- A prior attempt used an Anvil fixture that had been idle longer than the quote TTL. Its first attack was rejected as expired after four preparation transactions; no attack was sent. A freshly seeded round completed the 14-transaction run above. Run the exercise shortly after seeding a local round.
- The public page returned a quote from a fresh direct-attack local deployment without showing enrollment UI. Base Sepolia correctly showed Not Deployed; historical Robinhood displayed the defeated round. Native amount-field and network-selector keyboard handling passed. A clean reload after the development hot update showed no console error.
- The earlier local 18-transaction journey at `ebb9b87`, recorded in `.scratch/boss-pool-exercise/local-20260926T090227138Z-79386.json`, used the former enrollment contracts. It is historical evidence, separate from the current 14-transaction proof.

The browser checks did not automate an injected wallet's popup. Use the [manual wallet checklist](#manual-browser-wallet-checklist) to verify connection, network switch, direct attack, Router approval, rejection, signing, and receipt recovery.

## Historical Robinhood testnet run

The original enrollment-era SDK gameplay process submitted 16 successful transactions on chain `46630`. It completed enrollment, all three stages and refills, BossHP transfer, and both prize claims. It stopped before the two victory-NFT writes when an RPC returned `Block at number "124485152" could not be found.` The saved gameplay journal therefore has `status: "failed"`, but all 16 recorded transactions succeeded. These transactions use the previous contract source.

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

Use a fresh local round for writes. The historical Robinhood fixture is Defeated; Base Sepolia has no Boss Pool deployment yet. Keep any test wallet separate from personal funds, and never use an Anvil development key on a public network.

1. Open the app with a fresh local deployment and no wallet connected. Confirm that round state and an attack quote load without a wallet prompt.
2. Connect a dedicated test wallet. Confirm that the app shows the selected account and that the active chain matches the selected deployment.
3. Select the other network in the header. Confirm the wallet's network switch request, then test rejection and confirm that the app reports the mismatch without reusing stale player state or quotes.
4. Request an attack quote before approval. Confirm it shows the MockUSD cap, expected stage, outputs, and minimums. Check that approval names MockUSD and BossRouter with an unlimited allowance. Confirm that the UI offers no enrollment, Hook allowance, or entry NFT.
5. Reject the Router approval once and confirm that no attack is submitted. Approve it and attack directly. The app should show pending state after submission and apply damage only after the checked receipt.
6. Change accounts or advance the stage from a second wallet, then confirm that stale quotes require a new quote.
7. Refresh with a pending transaction. Confirm that the saved hash is checked through `resumePending(request)` and the app does not submit the write again.
8. After defeat, confirm that any reward approval names BossHP and BossHook with an unlimited allowance. Redeem BossHP and claim the victory NFT. Confirm that the UI updates from receipt-backed state and keeps reward redemption separate from the participation NFT.
