# Boss Pool requirements

Status: attacks count purchases without burns, and reward shares follow eligible BossHP rather than a per-wallet damage total. The worked claim default is transferable tokens surrendered into permanent custody; the frozen-balance alternative remains available. [BP01](bp01-foundation.md) records the local no-burn contract foundation. The full browser game and active Base Sepolia deployment remain unverified; the earlier Robinhood deployment is historical.

## Confirmed gameplay

### Permissionless meme-token bosses

#### Volume-based meme-token launch

The creator selects an existing meme token from their wallet, enters their own total meme-token allocation, sets a target trading volume in MockUSD, and chooses a prize percentage. No fixed allocation such as one million tokens is required. The launch preview must calculate funding from those inputs and the pool-pricing policy.

Confirmed in the product discussion:

- Players use MockUSD to buy the attack token, then spend the attack token to buy the selected meme token.
- The route uses a MockUSD/attack-token supply pool and a newly created attack-token/meme-token boss pool. Each boss creates its own second pool. Purchases for the encounter occur in that new boss pool.
- The target is denominated in MockUSD and refers to actual player purchases. Controller refills and token transfers do not earn progress. The two swaps in one purchase must not be counted as two contributions to the target.
- Victory depends on reaching the actual recorded MockUSD purchase-volume target. It is not merely a launch-time estimate of the cost of selling a token allocation.
- For the testnet version, derive the initial price from the launch inputs and pool configuration. An external meme-token market price is not required. Production price sourcing remains a separate decision.
- The victory prize is paid in the selected meme token and is a percentage of the creator's total deposited meme-token allocation. The creator chooses both values.
- Product discussion uses Chinese. Repository documents use English.

For a total allocation `N` in meme-token base units and prize rate `r` in basis points, reserve `P = floor(N * r / 10_000)` for victory prizes. Set the remaining battle allocation to `B = N - P`. The sellable battle budget is `S = 6 * floor(floor(B * 9_900 / 10_000) / 6)`. The unsold part of `B` covers refill fees, LP rounding, and reserve headroom. The creator deposits all `N` tokens at launch. The prize stays in escrow, and the battle tokens stay in the router or the boss positions.

The testnet factory reads the current MockUSD/attack-token pool price. It allows quoted attack-token output to rise by 10% when checking each first-hop purchase. It sets the boss-pool starting tick so the first price cannot sell the configured battle inventory before the volume target. A quote fails when the pools or token budget cannot fund the three releases and refills.

The stage-release model uses the selected volume-based victory condition. Its funding quote must establish that each stage can reach its volume threshold within the permitted pricing bounds. Funding requirements do not guarantee player participation or completion.

Stage release retains the three-stage ratio of 1:2:3:

| Stage | Additional eligible MockUSD volume | Cumulative threshold for a 6,000 MockUSD target | Action at the threshold |
| --- | --- | --- | --- |
| 1 | `floor(V / 6)` | 1,000 | Activate the second stage's incremental liquidity. |
| 2 | `floor(V / 3)` | 3,000 | Activate the third stage's incremental liquidity. |
| 3 | `V - floor(V / 6) - floor(V / 3)` | 6,000 | Defeat the boss and enable meme-token prize claims. |

All prize and battle funding is deposited at launch. Only first-stage liquidity is active initially. The remaining incremental LP allocations and maintenance reserves stay in controlled custody until their stage gate. Reaching a volume threshold advances the stage while unsold MEME remains in its positions. Pool exhaustion is not the completion condition.

The clearing transaction settles the player's purchase, records eligible MockUSD volume once, and performs the bounded refill and next-stage LP addition atomically. Volume credit is `floor(MockUSD spent * attack token spent / attack token bought)`. Returned attack tokens do not earn credit. Maintenance earns no volume or reward credit. A player attack affects only its starting stage. The router caps input at the current stage's remaining MockUSD target. A failed transition rolls back the purchase and its credit.

Stage inventory must be quoted against the permitted conversion-rate and price ranges, including fees and rounding. A reserve buffer alone does not prove that the threshold remains reachable. The launch calculation and execution guards must prevent accepted purchases from exhausting the stage inventory before its volume gate. The locked prize cannot be used to fix an inventory shortfall, and future-stage reserves cannot be released early.

Factory volume rounds require the MockUSD route. The legacy direct attack-currency route cannot add measured MockUSD volume and is disabled for factory bosses.

The contracts implement this volume model. The game UI still uses the standalone BossHP deployment.

#### Current contract implementation

`BossFactory` implements the volume model. It quotes the initial MEME/attack-token price from the active MockUSD/attack-token pool and derives a 1:2:3 MEME pool stage plan. An attack spends MockUSD on both hops in one router unlock, credits only the MockUSD share attributable to attack tokens spent on MEME, and returns unused input. A completed stage performs its refill and next liquidity addition atomically. Victory prizes are paid in MEME from the creator's allocation. The launch UI and network deployment remain outstanding.

### Standalone demo

1. Use MockUSD / ROY as the supply pool and ROY / BossHP as a real second pool.
2. Connect a wallet and press Attack. After any required MockUSD approval to the Router, one transaction buys ROY and then BossHP. No enrollment, entry fee, starter grant, or entry NFT is required.
3. ROY is paid into the Boss pool. The hook adds actual BossHP output to the current stage's `stageSold`. One purchased BossHP equals one effective damage unit. The player receives the tokens, which represent reward rights; no burn occurs.
4. Retain independent stage HP budgets of 300, 600, and 900. One attack affects only its starting stage.
5. Once the current registered allocation has no sellable HP, reset its price with a controller-only reserve-funded refill and add the next stage's incremental liquidity. Preloading every future allocation into active positions would violate this choice.
6. Final defeat freezes the eligible supply as the sum of actual player attack outputs. Eligible BossHP determines proportional MockUSD rewards. Victory NFT eligibility remains separate from transferable token reward rights.
7. Keep fixed prefunded supply, a separate sponsor prize, Next.js with TypeScript and Tailwind CSS, direct viem wallet/contract access, Bun, Uniswap v4, Base Sepolia, and the small monorepo.
8. Use the established two-person ownership: contracts/backend and UI/interface/gaming. Reuse existing solutions and verify the core through a shared E2E scenario.

There is one attack currency, ROY. MROY, two attack types, the 3x magic multiplier, and the 5x magic price are removed. Attacks burn neither ROY nor BossHP.

## Bounded defaults

| Topic | Default |
| --- | --- |
| Round | One deployment, one maker, one prize, one shared boss state. |
| Entry | Connect a wallet, approve MockUSD to the Router if needed, then Attack. No entry fee, entry NFT, starter ROY, or enrollment cap. |
| Primary action | MockUSD-funded attack through both pools. |
| Optional inventory action | Spend held ROY directly through the Boss pool; actual BossHP output earns damage. |
| Damage | Sum actual authorized BossHP output in the current stage; no spill into the next stage. |
| Settlement | Deliver purchased BossHP to the player and return unspent input/intermediate ROY. Bound the swap to the current stage's allocation. |
| Rewards | 1,000 MockUSD example prize. Proposed token claims surrender eligible BossHP into permanent custody without burning; partial or later claims with newly acquired eligible tokens are allowed. Victory-NFT claims remain separate and once per eligible wallet. |
| Deadline | A fixed deadline, with a two-hour round as a deployment target. |
| Expiry | If the boss survives, stop attacks and allow the maker to reclaim only the unawarded prize once. Attack purchases are nonrefundable. |
| Treasury | Unallocated tokens remain locked through the deadline. Future-stage reserve is separately game-gated so it can fund stage releases during play. |
| LP principal | Ordinary withdrawals remain locked through the deadline. Controller-only refills are allowed during transition. After victory, unsold HP and HP fees stay in controlled custody while reward rights remain outstanding, even beyond the deadline. |
| Price | AMM-dependent; neither a fixed damage rule, timelock, nor stage release promises a stable price. |
| Administration | No live HP/contribution edits, arbitrary stage releases, unrestricted minting, or active-prize withdrawal. |

These default quantities are demo choices, not real-value commitments. The supply and stage-reserve amounts are defined only after the [economy proof](economy.md).

## Trading and identity rules

The supply pool can support ordinary trading. A BossHP purchase in the canonical Boss pool must pass through the authenticated attack path. Player BossHP-to-ROY sell-backs are disabled in this pool, so an attacker cannot recycle purchased HP into another credited purchase. The controller-only reverse refill uses the frozen stage reserve during transition and earns zero contribution.

Direct token transfers, wallet balances, token supply, liquidity changes, and donations do not deal new damage or increase eligible reward supply. A transfer of eligible BossHP moves reward rights in the worked transferable model. Historical attack records and NFT eligibility do not move with the tokens. A wallet address does not establish human uniqueness.

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
| US03 | Connect a wallet and authorize the Router to spend MockUSD when needed. |
| US04 | Press Attack and atomically buy ROY, receive BossHP, and record its actual output as damage. |
| US05 | Clear a stage and activate the next stage's actual liquidity once. |
| US06 | See the new full HP bar, form, fee/quote state, and confirmed stage events. |
| US07 | Claim the proportional prize and a victory NFT after final defeat. |
| US08 | Optionally attack with held ROY by skipping the supply-pool hop. |
| US09 | Follow confirmed activity and contribution across wallets and refreshes. |
| US10 | Observe expiry and the separate prize/reserve/LP fund outcomes. |
| US11 | Trace the demo to public code, transactions, a focused E2E run, and sponsor feedback. |

## Core acceptance

Two fresh wallets execute the full two-hop route without enrollment or an entry NFT, receive real BossHP, clear all three stages, trigger exactly two reserve-funded refills and next-stage LP activations, and claim the prize. No NFT is minted during attacks or token claims; victory NFTs are optional separate claims. BossHP supply stays unchanged. Future-stage liquidity is unavailable before its gate. Failed stage activation rolls back all swaps, token deliveries, contribution, and stage changes.

The UI shows MockUSD input, intermediate ROY, purchased BossHP, effective damage, remaining sellable HP, returned inputs, both swap fees, and receipt status. A changed expected stage requires a fresh quote. Approvals are separate when necessary.

Keep the shared E2E and focused accounting checks. Optional held-ROY attacks, global activity, World ID, future ROY emissions, and long-term vesting do not block the core.

## Coordination

GitHub handles and the requested 26 September 09:00 coding / 10:00 live timezone remain unspecified. Keep issues unassigned. Earlier estimates and token allocations do not establish delivery time or capital requirements for this redesigned path.
