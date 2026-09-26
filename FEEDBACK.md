# Uniswap developer feedback

Updated 27 September 2026 against [PR #72](https://github.com/0xroylee/eth-global-2026-tokyo/pull/72), head `d0ad8d87ca5bab80c927e7412bd2a200a75549c5`. This feedback describes the current Factory implementation and distinguishes it from older public deployments and the standalone BossHP fixture. The feedback form has not been submitted.

## What we are building

Boss BoostPad creates a boss encounter for an ERC-20 its creator already holds. The creator commits a token allocation, escrows a prize in that token, and sets an eligible MockUSD purchase-volume target. Players use `MockUSD → Attack Token → creator token` through two v4 pools in one `PoolManager.unlock`. Purchased tokens go to players without burning. Actual output records damage and nontransferable per-player prize credit; claims consume that credit after victory while players keep purchased tokens.

All sale liquidity is active at launch along the standard concentrated-liquidity AMM curve. Three additional volume goals split the target 1:2:3. Clearing the first two stages starts shared 60- and 120-second cooldowns. Stages do not release token percentages, refill inventory, or reset price. Owner-added LP uses a separate position; initial liquidity, its fees, Router residue, player credit, and prize escrow remain separate.

The supply pool fee stays at 0.3%. A Factory without a fee controller also uses a fixed 0.3% Boss fee. The optional demo controller uses an owner-controlled Mock Token Oracle to raise the Boss LP fee when pool price is lower relative to its reference, or reduce it to 0% when sufficiently higher. This is labelled `TESTNET MOCK PRICE`, not live USD data. It changes transaction cost without resetting AMM price or guaranteeing protection against arbitrage or market losses. Real external-oracle integration remains future work.

## Why hooks fit this game

The game needs to enforce rules where a purchase executes. A frontend attack timer or a restricted button cannot stop another client from calling contracts. `beforeSwap` authenticates the canonical pool and Router request, checks the expected stage and cooldown, and supplies the optional dynamic fee. `afterSwap` reads actual swap deltas, records eligible volume and prize credit, and clears at most the starting stage. Another router cannot bypass these checks through PoolManager, and a failed rule reverts both hops and their accounting.

V4 lets us attach that logic to the Boss pool while reusing its AMM and settlement. The Hook returns zero token deltas; the Router handles output delivery and refunds. The [hooks overview](https://developers.uniswap.org/docs/protocols/v4/concepts/hooks), [dynamic fee mechanism](https://developers.uniswap.org/docs/protocols/v4/concepts/dynamic-fees), and [flash accounting guide](https://developers.uniswap.org/docs/protocols/v4/concepts/flash-accounting) describe the protocol mechanisms. Our [design explanation](docs/uniswap-v4-hooks.md) maps them to the callbacks and contracts.

## Current integration lessons

- Separate swap execution from Hook callbacks. V4 suppresses callbacks for actions initiated by the Hook itself, so BossRouter initiates operations and BossHook authenticates PoolManager, the full pool ID, Router, operation mode, and active player. Arbitrary `hookData` is not player authentication.
- Compute a per-swap fee from the same state and amounts used by the route. The controller combines the pre-swap Boss spot with measured first-hop spend/output. SDK quotes pin the route amounts and fee calculation to one block. The dynamic PoolKey sentinel and stored LP fee are not the percentage paid by that attack.
- Keep source validity, fee limits, and player slippage separate. The demo reference expires after 600 seconds; a required fee above 90% rejects rather than clamps. Player minimum outputs and deadlines independently bound execution. A same-price refresh updates freshness, but does not make the mock a trustworthy market valuation.
- Design stage tails in integer units. An attack normally credits at most remaining stage volume plus one MockUSD base unit. A larger terminal purchase is accepted only for exactly one Boss-token base unit of output. Actual overshoot stays in that stage. The SDK distinguishes the selected button cap from the exact signed cap needed to execute the quote.
- Shared cooldowns make stage changes observable without changing liquidity or price. Quotes and attacks reject until the chain timestamp reaches `nextAttackAt`; no activation transaction is needed. This gives players time to review the next stage, but does not prevent bots or guarantee equal participation.
- Keep LP depth and prize rights separate. Owner LP changes settle directly with the owner and earn no volume or credit. The locked initial liquidity is a position-size floor, not a price floor. A token balance or transfer cannot create Factory prize credit.

## Earlier standalone and network observations

These observations come from the earlier BossHP fixture and network research. Standalone reserve refills and transferable HP redemption do not describe the current Factory stages.

- During the earlier network investigation, the deployment table listed Robinhood mainnet but did not list Robinhood testnet. A documented path for deploying a supported development stack on a new testnet would help. See the [historical network source notes](docs/sources.md#historical-robinhood-chain-target).
- Probes of Robinhood's documented testnet RPC returned HTTP 403 from our planning environment on 25 and 26 September. This was a network-access observation, not a Uniswap contract failure. The active browser target is now Base Sepolia; historical Robinhood deployment and player-journey records are kept separately.
- The earlier local stage proof found that integer rounding could leave no sellable HP just before the exact terminal sqrt price. Its remaining-inventory check progressed where strict endpoint equality did not. This is a game integration lesson, not evidence of a v4 bug.
- Actor-specific currency deltas mattered for standalone maintenance. The router settled the player's trade before the reserve-funded refill so recovered Attack Token could not be mistaken for a player refund. The local no-burn fixture covered this path and failed-transition rollback. Current Factory stages perform no such refill.
- Real deployment exposed a token-order pricing error: using raw ticks [0,1920] for HP1 inverted the intended Attack Token/HP band. Mirroring HP1 to [-1920,0] restores the same human-unit prices as HP0. The reverse HP1 refill splits at bitmap boundary -60 for tick spacing 60, so its reserve quote rounds each interval separately. These are integration lessons, not evidence of a v4 bug.

## Requested developer-experience improvements

The most useful addition would be one maintained example combining a two-hop route, a `beforeSwap` dynamic fee based on measured first-hop amounts, and a public quote that simulates the same callbacks in a reverting frame. It should show token-order conversion, a block-pinned fee preview, stale-reference rejection, and propagation of Hook errors without presenting a sentinel as a fee percentage. Those pieces have to agree for our quoted attack and submitted transaction to use the same policy.

A callback call trace would also help. Show when callbacks are suppressed, which address the `sender` argument identifies, and how a Router establishes authenticated player context. An example that settles output and refunds with zero Hook return deltas would make the boundary between game accounting and v4 settlement easier to follow.

For new testnets, a small development-stack checklist should distinguish official deployments from team-deployed pinned core, state the required compiler/EVM settings, and include a first-swap verification path. Our historical RPC issue was environmental, so it should not be presented as a core protocol bug.

## Evidence and remaining verification

| Record | What it establishes |
| --- | --- |
| [Contract dependency notes](contracts/README.md) and [Foundry configuration](contracts/foundry.toml) | V4-core pin `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`; Solidity 0.8.26, Cancun, via IR, and optimizer runs 200. |
| [PR #72 integration review](https://github.com/0xroylee/eth-global-2026-tokyo/blob/39e651d67be4bb063349a328e945e48c4bdb3696/docs/evidence/2026-09-27-pr72-integration-review.md) | Records 14 passing real-v4 contract cases, ABI/bytecode consistency, SDK/UI checks, and historical Base Sepolia reads for the same source head. Owner LP management was excluded from that review's acceptance scope. |
| [Base Sepolia Factory deployment](docs/evidence/base-sepolia-perpetual-factory.json) and [demo launch](docs/evidence/base-sepolia-factory-demo-boss.json) | Older public contract builds and launch provenance, not a deployment of PR #72's continuous-liquidity/mock-fee build. |
| [Historical Factory review](docs/evidence/factory-review-verification.json) | Earlier local contract/SDK results and source identities. These results do not verify the newer fee/cooldown rules. |
| [Historical Robinhood SDK journey](docs/sdk-verification.md#historical-robinhood-testnet-run) | Separate deployment, gameplay, and claim receipts from the standalone fixture. |

The PR #72 review used real v4 contract fixtures and mocked clients for supplemental SDK checks. It did not deploy the newer Factory or run its Anvil SDK smoke. It also did not verify a browser-wallet popup or public attack, claim, or oracle-update transaction journey. Public contracts retain their original rules. Local evidence does not establish production security or reliable external-market protection.

This feedback update changes documentation only and does not rerun those application checks. A future demonstration should record the time to the first successful two-hop delivery, all stage cooldowns, prize claim, and mock reference update, with source/build identity and transaction evidence. Standalone refill/redemption timing belongs in a separate historical record.

## Submission

The submission owner completes the [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback) with a public link to this file and records confirmation in the submission issue. Publishing this draft alone does not complete that requirement.
