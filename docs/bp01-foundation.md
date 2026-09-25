# BP01 local contract foundation

This slice turns the plan into executable local contracts, a Bun workspace, a generated client and a read-only arena. GPT-6 Luna at xhigh implemented it; GPT-6 Sol at high reviewed it. The branch is `codex/bp01-contract-foundation`, based on `16cff85a6f2583667f0f2e6f614348463d2c0fed`.

## Implemented behavior

- Standard fixed-supply ROY and BossHP, test-only MockUSD, entry/victory NFTs, enrollment and starter ROY.
- BossRouter executes the real v4 MockUSD/ROY/BossHP route. BossHook records purchased HP without burning, gates the current stage and freezes eligible HP at defeat.
- Three stages, two same-pool reserve-funded resets, fresh incremental LP positions, player settlement before maintenance, and atomic failed-transition rollback.
- Transferable HP reward rights, partial/final redemption into permanent custody, independent victory-NFT eligibility, expiry and prize refund.
- Initialization requires complete HP custody and funded transition requirements, and rejects an unusable supply seed. Setup, enrollment and attacks reject the exclusive deadline.
- Fixed 3,000-pip LP fees and zero protocol fee are enforced for the supported local route.

The Hook chooses `[0,1920]` for HP0 or `[-1920,0]` for HP1. Both normalize to 1 → approximately 1.211659 ROY/HP. HP1 refill quotes include separate rounding across the -60 bitmap boundary. The measured first-stage total in the HP1 regression is 331.219793595396366740 ROY.

## Focused evidence

The shared `BossPoolCoreTest` contains four cases: a full HP0 two-wallet round/claims path, an HP1 attack/clear/split-refill regression, late setup rejection, and expiry. The main path also checks unchanged supply, actual delivery, no stage spill, reserve-underfunding rollback, transferable redemption and unauthorized swap rejection. This is focused coverage, not a production audit.

| Command or check | Result observed during delivery |
| --- | --- |
| `bun run contracts:build` | Pass |
| `bun run contracts:test` | Four focused cases pass |
| `forge build --root contracts --sizes` | Hook 20,860 B; Router 19,726 B; no size override |
| `bun run abi:export` / `bun run abi:check` | Real compiled ABI exported and checked |
| `bun run typecheck` / `bun run web:build` | Pass; Vite reports a non-blocking bundle-size warning |
| `bun run local:seed` / `bun run local:smoke` | Real CREATE2/local deployment and normalized-price/custody reads pass |
| Browser, missing manifest | Shows NOT DEPLOYED and instructions; no fake game values |
| Browser, final local manifest | LIVE only after chain/receipt/code checks; Active stage 1, 1,000 MockUSD escrow, 2,000 HP supply, Router 1,700 / PoolManager 300 / Hook 0 HP |

The source review resolved enrollment, deadline, initial custody, supply-capacity and currency-order pricing findings. The fixed contract implementation is recorded in commits `8f9dce0`, `572a206` and `7a874ff`; the full workspace/integration review accompanies the pull request. Fresh command evidence is also retained in the local `.scratch/deliver-code/bp01-contract-foundation/` directory.

## Actual local seed

Use [the generated manifest](../apps/web/public/deployments/local.json) for exact current addresses, pool keys, ticks, prices, balances and receipt. The final observed deployment uses chain 31337, RPC `http://127.0.0.1:8547`, and recorded deployment receipt block 24. Its BossHP is currency0 and its range is `[0,1920]`; HP1 is separately covered in the shared contract fixture. Earlier local deployment metadata was superseded after the token-order correction.

ROY supply is 100,000, all initially held by Router. The supply LP consumes approximately 50,000 ROY, leaving a 10,000 starter budget and approximately 40,000 inaccessible surplus. MockUSD funding is 5,001 to Router plus the separate 1,000 prize. Actual LP debits and the unused MockUSD cushion are recorded in the manifest. These are finite-range v4 amounts; the older full-range 207.58-MockUSD cost illustration is not a measured cost for this deployment.

## Limits and next slices

The arena reads state and optional local-wallet balances. It does not yet offer the complete browser attack/claim journey or finished game assets. The held-ROY route, LP/treasury/fee recovery and production NFT metadata remain downstream work. There is no recovery path for Router treasury/LP assets in this foundation, so they remain locked; permanently redeemed HP is intentionally never recoverable.

A fresh Robinhood testnet `eth_chainId` probe on 26 September again returned HTTP 403 from this environment. No target-chain ID/bytecode result or deployment was obtained. BP11 remains the target-chain release gate. The local deployment uses the pinned v4 PoolManager; [contracts/README.md](../contracts/README.md) records dependency provenance and per-file licenses.

The working redemption choice is still transferable HP surrendered without burn. A frozen-balance product alternative would require a deliberate specification change, not an automatic switch inside this implementation.
