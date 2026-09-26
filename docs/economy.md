# Boss BoostPad allocation, fees, and liquidity

The current Factory economy follows [PR #72](https://github.com/0xroylee/eth-global-2026-tokyo/pull/72), head `d0ad8d87ca5bab80c927e7412bd2a200a75549c5`. All sale liquidity is active at launch. The later standalone sections retain the earlier staged BossHP model and its [refill math](refill-math.md). Public deployments keep their original contract economics; this source update does not migrate their liquidity or claims.

## Factory allocation and continuous sales

For factory bosses, BossHP is the existing meme token selected by the creator. Funding requires only the round's allocation, not the token's entire supply. The prize denominator is still actual authorized purchase output, but claims consume per-player credit. Players keep their purchased meme tokens. This avoids assigning prize rights to unrelated circulating supply.

Factory creators enter a total token allocation, a prize percentage, and a MockUSD volume target. For allocation `N`, the Hook holds prize `P = floor(N × prizeBps / 10,000)`. The remaining `S = N - P` is the sale budget for one initial position with salt `1`, subject to LP rounding. Router custody residue stays locked; it is not another stage allocation. No attack burns tokens.

The start price uses the frozen launch supply-rate bound with raw-unit headroom `(V + 2)/(S - 2)` for terminal rounding. All sale liquidity is active from launch and sells along the ordinary concentrated-liquidity AMM curve. There is no percentage token bucket or linear relationship between MockUSD volume and tokens sold. Stage changes add no liquidity, release no proportional inventory, perform no refill, and reset no price. The retained `stageOneHP` quote field is compatibility metadata, not a sale cap.

The three additional volume goals split 1:2:3. The Hook credits `floor(MockUSDSpent × AttackTokenSpent / AttackTokenBought)` from actual swap amounts, so returned Attack Token earns no volume. At the current stage's tail it allows one extra MockUSD base unit, or a larger terminal purchase whose output is exactly one Boss-token base unit. These exceptions cover fee/token indivisibility. All actual volume, including overshoot, stays in that stage and cannot reduce a future goal. Clearing stages one and two starts shared 60- and 120-second cooldowns. This paces participation without interrupting the AMM curve; it does not guarantee equal access or token value.

## Factory fee policy and execution cost

The supply pool charges 0.3%. A Boss pool without a controller also charges 0.3%. The optional controller-enabled demo uses an owner-supplied MockUSD/Boss-token reference and v4's per-swap LP fee override. A lower Boss pool price relative to the reference raises the fee; a sufficiently higher price can reduce it to zero. The [Factory fee reference](boss-factory.md#testnet-mock-price-and-fees) defines the exact formula, units, and examples.

The demo's `maxAge = 600` rejects outdated reference data, and `maxFee = 90%` rejects a higher required fee rather than clamping it. These checks are separate from the frozen first-hop rate bound and the player's minimum outputs. Supply fees, Boss fees, finite-trade price impact, and gas all affect purchase cost. Boss fees accrue to LP positions rather than funding the prize. A zero Boss fee does not mean a free attack.

The mock reference is a testnet control, not real USD data. Changing or refreshing it does not change pool inventory, ticks, or spot price. The fee policy adjusts transaction cost relative to that chosen number; it does not automatically align markets or guarantee removal of arbitrage, impermanent loss, or market losses. Real external-oracle integration remains future work. See the [design rationale and limits](uniswap-v4-hooks.md#what-the-mock-token-oracle-changes).

## Factory owner LP and prize isolation

Factory creators cannot recover the prize, initial position, initial-position fees, or Router residue. They can add and remove a separate proportional owner position with salt `4` above the locked initial `L`. Its token debts settle directly from the owner to PoolManager, and its net credits go to the owner. Principal slippage checks exclude accrued fees. Owner LP actions earn no volume, damage, or prize credit and cannot spend the Hook's prize.

Adding LP mainly deepens the pool and reduces later price impact; removing the extra LP can increase it. The locked `L` is a position-size floor, not a token-price floor or a guarantee of active depth outside the position's finite range. Fees on the initial position remain locked even when the owner removes the extra position.

New Factory bosses never expire. After victory, `finalEligibleHP` freezes actual attack output, and a player's claim consumes their per-boss credit for `floor(originalPrize × creditUsed / finalEligibleHP)` MEME. Players keep purchased tokens. Ordinary balances, transfers, initial inventory, and owner LP do not create reward credit. Claims remain available indefinitely, but an undefeated perpetual boss pays no victory prize. Attack purchases are nonrefundable. See the [Factory accounting reference](boss-factory.md).

## Standalone token movement

The quantities and transferable BossHP model below describe the standalone demo, not the current Factory mode. The refill calculation and historical burn proof do not establish a Factory inventory-release policy.

```text
MockUSD → supply pool → Attack Token → Boss pool → BossHP delivered to player
                                      → hook purchase counters
```

The primary attack pays Attack Token into the Boss pool and delivers purchased BossHP to the player. The hook counts its actual output as damage. Neither token is burned. The two AMM prices together determine MockUSD cost per HP. The previous 1,800-Attack Token / 600-MROY burn comparison and 12,000-MockUSD funding estimate no longer describe this game.

## Standalone fixed prefunding

Keep Attack Token fixed-supply. The previous 100,000-Attack Token amount is only a candidate until allocations reconcile to the new plan. Remove MROY entirely.

Prefund BossHP before activation. Its cap must cover initial liquidity, transition refills including swap fees, incremental LP additions, and a justified rounding allowance. Nominal sales 300 + 600 + 900 = 1,800 are not automatically the required total supply.

```text
Attack Token supply = supply-pool allocation
           + initial/future Boss-pool paired-Attack Token reserve
           + unallocated locked treasury

BossHP supply = initial Boss-pool allocation
              + gated transition refill inputs including fees
              + gated incremental stage LP additions
              + separately disclosed unused reserve
```

Do not double-count a buffer inside a stage allocation. Stage release transfers prefunded assets into actual LP positions; it does not mint an unbounded new supply.

The stage reserve is game-gated and available for the specified release during the fight. Unallocated treasury is time-locked through the deadline. Locking both behind the same end-of-round timelock would prevent progression.

## Standalone stage budgets

| Stage | Effective damage quota | Release condition |
| --- | --- | --- |
| 1 | 300 BossHP | Funded round activation |
| 2 | 600 BossHP | Stage 1 cleared and the bounded LP addition succeeds |
| 3 | 900 BossHP | Stage 2 cleared and the bounded LP addition succeeds |

One BossHP purchased through an authorized attack equals one damage unit and enters eligible reward circulation. Freeze eligible supply as actual player purchases at final defeat; it may be a few base units below the nominal 1,800 due to rounding. Unpurchased residue has no reward rights.

Use a finite range that permits all sellable HP to be purchased at a finite terminal price. Neither a raw pool balance nor a hard nominal sum is the completion test; validate registered positions, cumulative sales, and unsellable residue. The exact design must be verified with v4 amounts, ticks, fees, and rounding. [Uniswap concentrated liquidity](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/concentrated-liquidity) · [Range orders](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/range-orders)

Removing the burn does not change the modeled swap prices, gross inputs, reset fees, or reserve spending. About 1,800 HP ends in player wallets instead of being destroyed. Total BossHP supply remains fixed. Eligible tokens now represent reward rights, with a worked proposal to surrender them into permanent custody for `originalPrize * surrenderedHP / finalEligibleHP`. Transfers move reward rights without causing damage. Player reverse trades into the Boss pool remain disabled.

## Standalone funding and permissions

Keep the 1,000 MockUSD example prize separate from both pools and stage reserve. Players pay only the attack swap input; there is no enrollment fee or starter-token allocation. LP fee revenue does not automatically refill the prize.

The frozen controller-only refill exchanges reserve BossHP for the Attack Token left in the exhausted positions, then adds HP-only incremental liquidity at the restored boundary. Prefund the entire transition cost, including fees. Settle player trades before maintenance; recovered Attack Token belongs to reserve custody. New LP debt must never be charged to the clearing attacker beyond their signed trading bounds.

Keep existing LP positions through the deadline and add fresh incremental positions after each reset. Ordinary principal withdrawals remain locked. Predefined refill swaps are the only in-round path moving LP Attack Token into reserve custody. After victory, unissued HP and HP fees stay under protocol control while any eligible reward rights remain outstanding, even beyond the deadline. LP ownership and recovery routes must not leak those tokens into redeemable circulation. Redeemed HP stays locked permanently. Leave LP fees uncollected for the current funding model.

Reuse an existing ERC-20 timelock for unallocated treasury, such as zero-duration OpenZeppelin VestingWallet. It is not an LP lock and does not stabilize price. Gradual team vesting and additional Attack Token emissions are future work. [OpenZeppelin finance](https://docs.openzeppelin.com/contracts/5.x/api/finance)

## Standalone scenario before freezing numbers

Reuse the core two-hop/E2E fixture. Choose candidate supply-pool depth, Attack Token/BossHP starting price, stage LP ranges, inventory buffers, reserve funding, and per-attack limits. No earlier Attack Token/MROY amount is a validated default for this route.

Record each hop's spend/output, delivered BossHP, purchase counters, unchanged supply, leftovers, price, active liquidity, LP addition amounts, reserve debits, and final currency deltas. Demonstrate all stages can clear and activate in order, including the last fractional/base-unit HP and a failed-release rollback.

Only freeze amounts after that evidence. Do not add another economics framework or promise a price band. Total supply, treasury locks, dynamic fees, and minOut settings cannot guarantee market stability. The game remains sponsor-funded.
