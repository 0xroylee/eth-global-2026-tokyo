# Attack Token, BossHP, and staged liquidity

Status: the two-hop BossHP design now counts purchases without burning tokens. The candidate same-range refill model is calculated in [refill math](refill-math.md); its prior execution proof used burns. The updated shared scenario must verify ordinary output delivery and unchanged supply.

## What moves

For factory bosses, BossHP is the existing meme token selected by the creator. Funding requires only the round's allocation, not the token's entire supply. The prize denominator is still actual authorized purchase output, but claims consume per-player credit. Players keep their purchased meme tokens. This avoids assigning prize rights to unrelated circulating supply.

Factory creators enter a total meme-token allocation, a prize percentage, and a MockUSD volume target. The prize stays in MEME escrow. The contract derives the starting tick from the active MockUSD/ROY price and the 99% sell budget. The other 1% funds refill fees and LP rounding. It releases attack-token/MEME liquidity at volume thresholds split 1:2:3. Players must spend MockUSD through both swaps, so returned ROY does not count toward the target. New Factory bosses never expire. Creators cannot recover LP assets or unused reserves, including after defeat; player prize claims remain available indefinitely. See the [factory accounting reference](boss-factory.md).

The quantities and transferable BossHP model below remain the standalone demo defaults.

```text
MockUSD → supply pool → Attack Token → Boss pool → BossHP delivered to player
                                      → hook purchase counters
```

The primary attack pays Attack Token into the Boss pool and delivers purchased BossHP to the player. The hook counts its actual output as damage. Neither token is burned. The two AMM prices together determine MockUSD cost per HP. The previous 1,800-Attack Token / 600-MROY burn comparison and 12,000-MockUSD funding estimate no longer describe this game.

## Fixed prefunding

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

## Stage budgets

| Stage | Effective damage quota | Release condition |
| --- | --- | --- |
| 1 | 300 BossHP | Funded round activation |
| 2 | 600 BossHP | Stage 1 cleared and the bounded LP addition succeeds |
| 3 | 900 BossHP | Stage 2 cleared and the bounded LP addition succeeds |

One BossHP purchased through an authorized attack equals one damage unit and enters eligible reward circulation. Freeze eligible supply as actual player purchases at final defeat; it may be a few base units below the nominal 1,800 due to rounding. Unpurchased residue has no reward rights.

Use a finite range that permits all sellable HP to be purchased at a finite terminal price. Neither a raw pool balance nor a hard nominal sum is the completion test; validate registered positions, cumulative sales, and unsellable residue. The exact design must be verified with v4 amounts, ticks, fees, and rounding. [Uniswap concentrated liquidity](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/concentrated-liquidity) · [Range orders](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/range-orders)

Removing the burn does not change the modeled swap prices, gross inputs, reset fees, or reserve spending. About 1,800 HP ends in player wallets instead of being destroyed. Total BossHP supply remains fixed. Eligible tokens now represent reward rights, with a worked proposal to surrender them into permanent custody for `originalPrize * surrenderedHP / finalEligibleHP`. Transfers move reward rights without causing damage. Player reverse trades into the Boss pool remain disabled.

## Funding and permissions

Keep the 1,000 MockUSD example prize separate from both pools and stage reserve. Players pay only the attack swap input; there is no enrollment fee or starter-token allocation. LP fee revenue does not automatically refill the prize.

The frozen controller-only refill exchanges reserve BossHP for the Attack Token left in the exhausted positions, then adds HP-only incremental liquidity at the restored boundary. Prefund the entire transition cost, including fees. Settle player trades before maintenance; recovered Attack Token belongs to reserve custody. New LP debt must never be charged to the clearing attacker beyond their signed trading bounds.

Keep existing LP positions through the deadline and add fresh incremental positions after each reset. Ordinary principal withdrawals remain locked. Predefined refill swaps are the only in-round path moving LP Attack Token into reserve custody. After victory, unissued HP and HP fees stay under protocol control while any eligible reward rights remain outstanding, even beyond the deadline. LP ownership and recovery routes must not leak those tokens into redeemable circulation. Redeemed HP stays locked permanently. Leave LP fees uncollected for the current funding model.

Reuse an existing ERC-20 timelock for unallocated treasury, such as zero-duration OpenZeppelin VestingWallet. It is not an LP lock and does not stabilize price. Gradual team vesting and additional Attack Token emissions are future work. [OpenZeppelin finance](https://docs.openzeppelin.com/contracts/5.x/api/finance)

## One scenario before freezing numbers

Reuse the core two-hop/E2E fixture. Choose candidate supply-pool depth, Attack Token/BossHP starting price, stage LP ranges, inventory buffers, reserve funding, and per-attack limits. No earlier Attack Token/MROY amount is a validated default for this route.

Record each hop's spend/output, delivered BossHP, purchase counters, unchanged supply, leftovers, price, active liquidity, LP addition amounts, reserve debits, and final currency deltas. Demonstrate all stages can clear and activate in order, including the last fractional/base-unit HP and a failed-release rollback.

Only freeze amounts after that evidence. Do not add another economics framework or promise a price band. Total supply, treasury locks, dynamic fees, and minOut settings cannot guarantee market stability. The game remains sponsor-funded.
