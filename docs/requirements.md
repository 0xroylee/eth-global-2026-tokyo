# Boss Pool requirements

Status: attacks count purchases without burns, and reward shares follow eligible BossHP rather than a per-wallet damage total. The worked claim default is transferable tokens surrendered into permanent custody; the frozen-balance alternative remains available. [BP01](bp01-foundation.md) records the local no-burn contract foundation. The full browser game and testnet deployment remain unverified. Base Sepolia is the selected testnet target for new wallet and deployment work. The existing Robinhood testnet evidence is historical and does not prove a Base deployment.

## Confirmed gameplay

1. Use MockUSD / ROY as the supply pool and ROY / BossHP as a real second pool.
2. Pressing Attack buys ROY and then BossHP in one transaction after any required approval.
3. ROY is paid into the Boss pool. The hook adds actual BossHP output to the current stage's `stageSold`. One purchased BossHP equals one effective damage unit. The player receives the tokens, which represent reward rights; no burn occurs.
4. Retain independent stage HP budgets of 300, 600, and 900. One attack affects only its starting stage.
5. Once the current registered allocation has no sellable HP, reset its price with a controller-only reserve-funded refill and add the next stage's incremental liquidity. Preloading every future allocation into active positions would violate this choice.
6. Final defeat freezes the eligible supply as the sum of actual player attack outputs. Eligible BossHP determines proportional MockUSD rewards. Victory NFT eligibility remains separate from transferable token reward rights.
7. Keep fixed prefunded supply, a separate sponsor prize, Next.js with TypeScript and Tailwind CSS, direct viem wallet/contract access, Bun, Uniswap v4, Base Sepolia testnet, and the small monorepo.
8. Use the established two-person ownership: contracts/backend and UI/interface/gaming. Reuse existing solutions and verify the core through a shared E2E scenario.

There is one attack currency, ROY. MROY, two attack types, the 3x magic multiplier, and the 5x magic price are removed. Attacks burn neither ROY nor BossHP.

## Bounded defaults

| Topic | Default |
| --- | --- |
| Round | One deployment, one maker, one prize, one shared boss state. |
| Enrollment | Pay 10 MockUSD for a Little Roy entry NFT and 100 ROY; one enrollment per wallet, cap 100. |
| Primary action | MockUSD-funded attack through both pools. |
| Optional inventory action | Spend held ROY directly through the Boss pool; actual BossHP output earns damage. |
| Damage | Sum actual authorized BossHP output in the current stage; no spill into the next stage. |
| Settlement | Deliver purchased BossHP to the player and return unspent input/intermediate ROY. Bound the swap to the current stage's allocation. |
| Rewards | 1,000 MockUSD example prize. Proposed token claims surrender eligible BossHP into permanent custody without burning; partial or later claims with newly acquired eligible tokens are allowed. Victory-NFT claims remain separate and once per eligible wallet. |
| Deadline | A fixed deadline, with a two-hour round as a deployment target. |
| Expiry | If the boss survives, stop attacks and allow the maker to reclaim only the unawarded prize once. Attack purchases and entry fees are nonrefundable. |
| Treasury | Unallocated tokens remain locked through the deadline. Future-stage reserve is separately game-gated so it can fund stage releases during play. |
| LP principal | Ordinary withdrawals remain locked through the deadline. Controller-only refills are allowed during transition. After victory, unsold HP and HP fees stay in controlled custody while reward rights remain outstanding, even beyond the deadline. |
| Price | AMM-dependent; neither a fixed damage rule, timelock, nor stage release promises a stable price. |
| Administration | No live HP/contribution edits, arbitrary stage releases, unrestricted minting, or active-prize withdrawal. |

These default quantities are demo choices, not real-value commitments. The supply and stage-reserve amounts are defined only after the [economy proof](economy.md).

## Trading and identity rules

The supply pool can support ordinary trading. A BossHP purchase in the canonical Boss pool must pass through the authenticated attack path. Player BossHP-to-ROY sell-backs are disabled in this pool, so an attacker cannot recycle purchased HP into another credited purchase. The controller-only reverse refill uses the frozen stage reserve during transition and earns zero contribution.

Direct token transfers, wallet balances, token supply, liquidity changes, and donations do not deal new damage or increase eligible reward supply. A transfer of eligible BossHP moves reward rights in the worked transferable model. Historical attack records and NFT eligibility do not move with the tokens. Testnet entry cost does not establish human uniqueness.

Held BossHP cannot be submitted again for damage. After victory, the worked proposal allows its holder to surrender tokens for a proportional reward. The same tokens cannot remain spendable after redemption. The prize denominator excludes protocol reserve and HP fees. See [reward math](refill-math.md#rewards-follow-eligible-bosshp) for the formula, custody requirements, and rounding.

## Stage release behavior

The clearing attack buys only current-stage HP. The hook marks that stage cleared. After that swap returns, the router settles the player's trade and delivers its BossHP. The controller then refills the same pool to the lower price and adds the incremental liquidity before opening the next stage. The maintenance swap does not count as an attack; a second player attack within this transaction is prohibited.

The proposed release and attack are atomic. If next-stage LP cannot be activated or settled, the entire clearing attack reverts. BP01 must prove that the frozen reserve and position configuration can activate every stage without charging the attacker additional LP funding.

HP budgets are nominal stage allocations, not PoolManager's raw ERC-20 balance. Cumulative purchased HP tracks damage. Clearing also validates that the intact registered positions have no remaining sellable HP, so an unsellable base-unit residue cannot block the next stage. Record rounding residue without awarding contribution; do not require `stageSold == 300e18` or another nominal constant. See [HP lifecycle](hp-lifecycle.md).

## User stories

| ID | Story |
| --- | --- |
| US01 | Connect to Base Sepolia and verify the two-hop route and stage LP primitives. |
| US02 | Fund and activate a round with the prize, initial LP, and gated future-stage reserve. |
| US03 | Enroll once and receive the entry NFT and starter ROY. |
| US04 | Press Attack and atomically buy ROY, receive BossHP, and record its actual output as damage. |
| US05 | Clear a stage and activate the next stage's actual liquidity once. |
| US06 | See the new full HP bar, form, fee/quote state, and confirmed stage events. |
| US07 | Claim the proportional prize and a victory NFT after final defeat. |
| US08 | Optionally attack with held ROY by skipping the supply-pool hop. |
| US09 | Follow confirmed activity and contribution across wallets and refreshes. |
| US10 | Observe expiry and the separate prize/reserve/LP fund outcomes. |
| US11 | Trace the demo to public code, transactions, a focused E2E run, and sponsor feedback. |

## Core acceptance

Two wallets enroll, execute the full two-hop route, receive real BossHP, clear all three stages, trigger exactly two reserve-funded refills and next-stage LP activations, and claim the prize/NFT. BossHP supply stays unchanged. Future-stage liquidity is unavailable before its gate. Failed stage activation rolls back all swaps, token deliveries, contribution, and stage changes.

The UI shows MockUSD input, intermediate ROY, purchased BossHP, effective damage, remaining sellable HP, returned inputs, both swap fees, and receipt status. A changed expected stage requires a fresh quote. Approvals are separate when necessary.

Keep the shared E2E and focused accounting checks. Optional held-ROY attacks, global activity, World ID, future ROY emissions, and long-term vesting do not block the core.

## Coordination

GitHub handles and the requested 26 September 09:00 coding / 10:00 live timezone remain unspecified. Keep issues unassigned. Earlier estimates and token allocations do not establish delivery time or capital requirements for this redesigned path.
