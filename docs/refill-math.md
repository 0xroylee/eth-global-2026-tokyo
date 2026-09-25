# Boss Pool refill math

Status: numerical model with a BP01 no-burn implementation, 26 September 2026. Stage progression counts actual purchases; eligible BossHP represents reward rights and is surrendered into permanent custody at claim. The current shared Foundry fixture passes four focused cases, including a full HP0 round/claims path and an HP1 mirrored-range attack/refill regression. Historical burn-based observations remain separately labeled below. Values are local test parameters, not a claim of market stability or target-chain verification.

## Assumptions

- One ROY / BossHP battle pool; both tokens use 18 decimals. The equations use normalized ROY-per-BossHP prices, independently of address sorting.
- Nominal stage HP is 300, 600, and 900.
- Every stage uses the same finite range, tick spacing 60. Use `[0, 1920]` when BossHP is currency0, and `[-1920, 0]` when BossHP is currency1. Both start at normalized price 1 and finish near 1.211659 ROY/HP. Hook immutable bounds are authoritative for the router and manifest.
- Price is ROY per BossHP. `P_low = 1`; `P_high = 1.0001^1920 = 1.211658885759174828926510469707860814750856832246328162756272699402253`.
- Fixed swap fee `f = 0.003` in both directions. Protocol fee is zero.
- Only registered game-owned liquidity participates. Players receive BossHP and its actual authorized purchase output advances the stage. Eligible tokens carry transferable reward rights. No token is burned. Only the controller can reverse-swap during Transition; player sell-backs are prohibited.
- Freeze eligible reward supply at final defeat as the sum of actual player attack outputs. Prefunded reserve, LP fees, rounding residue, and controller refills are not additional reward rights.
- Unissued HP and HP fees cannot leave controlled protocol custody while any winning-round reward rights remain outstanding. This restriction continues beyond the round deadline. Redeemed HP never returns to circulation.
- Resets happen after stages 1 and 2. Stage 3 ends in Defeated without another refill.
- Each top-up adds a fresh incremental position in the same range. Previous position fees remain uncollected, so they cannot silently subsidize the next funding step.
- Calculations in the first sections use continuous amounts. The integer v4 implementation must separately account for base-unit rounding.

The position equations come from the [Uniswap v3 whitepaper](https://app.uniswap.org/whitepaper-v3.pdf); v4 uses the same concentrated-liquidity model. Exact step fees and rounding follow the pinned [SwapMath](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/SwapMath.sol) and [SqrtPriceMath](https://github.com/Uniswap/v4-core/blob/46c6834698c48bc4a463a86d8420f4eb1d7f3b75/src/libraries/SqrtPriceMath.sol). The numerical model and deductions below are our calculations.

For HP1, the attack starts at raw tick 0 and moves down to -1920. Its initial tick crossing has zero output, then one positive-output interval. The reverse refill can split at raw tick -60, the bitmap word boundary for spacing 60. The implementation sums rounded input and fee for both refill intervals; a single continuous `H/(1-f)` formula alone is not an exact integer funding quote. The HP1 regression measures total stage-one spend of 331.219793595396366740 ROY and verifies the normalized start/end/reset prices.

## Stage equations

Let `a = sqrt(P_low)`, `b = sqrt(P_high)`, and `H_i` be a stage's sellable BossHP inventory.

```text
L_i = H_i / (1/a - 1/b)

Net ROY deposited into LP while selling H_i:
Y_i = L_i * (b-a) = H_i * a * b

Gross ROY paid by players:
C_i = Y_i / (1-f)

ROY LP fee:
F_ROY_i = C_i - Y_i
```

Here `a*b = 1.100753780715367258795495644244473625414131375548283588615684417865703`. The average gross cost is about 1.104066 ROY per HP for every complete stage. Stage size changes total cost and depth, while the starting/ending price band stays the same.

For an attack buying `d` HP from current square-root price `s`:

```text
0 <= d <= L_i * (1/s - 1/b)
next_s = 1 / (1/s - d/L_i)
ROY_input = L_i * (next_s - s) / (1-f)
```

At the last sellable HP, `next_s = b`, which is finite. The finite liquidity range therefore has a finite clearing cost. This avoids the infinite cost of removing the last reserve unit from an unbounded constant-product pool. In integer execution, clearing means no sellable HP remains in the registered positions; a bounded base-unit residue does not earn contribution.

For each reset, the controller supplies fresh BossHP from reserve to reverse the prior stage's principal exchange:

```text
Gross BossHP input for reset:
R_HP_i = H_i / (1-f)

ROY returned to game custody:
R_ROY_i = H_i * a * b

BossHP LP fee for reset:
F_HP_i = R_HP_i - H_i

Additional LP inventory after reset:
TopUp_i = H_(i+1) - H_i
```

Reset already restores H_i BossHP principal to the existing positions. Therefore moving from 300 to 600 HP requires an additional 300 HP after the reset, not another full 600. Moving from 600 to 900 also adds 300.

## Three-stage calculation

Rounded display values; calculations retain higher precision.

| Stage | HP sold to players | Player ROY input | Reset BossHP input | Reset ROY to reserve | LP BossHP added after this stage |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 300.000000 | 331.219794 | 300.902708 | 330.226134 | 300.000000 |
| 2 | 600.000000 | 662.439587 | 601.805416 | 660.452268 | 300.000000 |
| 3 | 900.000000 | 993.659381 | 0.000000 | 0.000000 | 0.000000 |

Every refill returns price from 1.211659 to 1 ROY/HP, a 17.468521% drop from the stage-end spot price. Adding the next LP increment alone does not move price.

The player's clearing trade is settled before maintenance, or the two use separate delta accounts. Reset ROY belongs to game custody, never to the player's refund. Maintenance creates no damage, eligible reward supply, or player trading-volume credit.

## Minimum prefunded BossHP

With fees left uncollected:

```text
RequiredHP = H_1 + sum(reset HP inputs + LP top-ups)
           = sum(H_i) + f/(1-f) * sum(H_i for nonfinal stages)
           = 1,800 + 0.003/0.997 * (300 + 600)
           = 1802.708124373119358074222668004012036108324974924774322968906720160482
```

A 2,000-BossHP budget covers this modeled trace, leaving about 197.291876 in reserve. Nominally 1,800 is delivered to players and 2.708124 remains as HP fees in PoolManager. The historical execution fixture below starts with 10,000 HP and measures spending; it does not separately test a 2,000-HP initial reserve or the new no-burn path. Integer dust must be reconciled separately, and this calculation is not a universal reserve bound for arbitrary attack fragmentation or configurations.

If modifying an old position collects its accrued fees, the accounting changes. Reinvesting the game's own fees can reduce reserve needs. This model deliberately does not assume that optimization, and it does not use fees twice.

## Conservation checks

```text
ROY paid by players:
1,987.318762
  = 990.678403  controller reserve from the two resets
  + 990.678403  final LP ROY principal
  + 5.961956  uncollected ROY LP fees

BossHP required:
1,802.708124
  = 1,800.000000  BossHP delivered to players in the continuous model
  + 2.708124  uncollected BossHP reset fees
```

These equalities were checked using Decimal arithmetic at 70-digit precision. The reset spends fresh reserve HP to acquire the ROY left in the prior LP inventory. Removing the burn changes the output's destination and total-supply ledger, not the AMM equations or funding requirements. The updated no-burn balance is `initial HP supply = unused reserve + player holdings + PoolManager holdings`, with unchanged total supply.

## Optional MockUSD supply-pool estimate

This part is an analytical funding example, not yet a real-v4 two-hop execution test. Assume a full-range approximation with 50,000 ROY + 5,000 MockUSD, 0.30% fee, fees left uncollected, no other trades/LP changes, and exactly the ROY needed by the battle. Starter ROY is not spent in this primary-route example and excess ROY is not overbought. Price starts at 0.1 MockUSD/ROY.

For cumulative ROY purchases `R`:

```text
MockUSD_input(R) = 5,000 * R / (50,000 - R) / (1-0.003)
```

| Stage | Additional MockUSD input | Cumulative MockUSD input |
| --- | ---: | ---: |
| 1 | 33.443185 | 33.443185 |
| 2 | 68.242568 | 101.685753 |
| 3 | 105.894683 | 207.580436 |

The modeled ROY spot ends at 0.108450 MockUSD, about 8.449634% above its starting price. Battle-pool refill resets BossHP's ROY price; it does not reset ROY's MockUSD price. Actual v4 ranges, 6/18-decimal rounding, external flow, and unused intermediate tokens change this estimate.

Example setup capital is 5,000 MockUSD in the supply LP plus the separate 1,000 MockUSD prize. ROY supply and allocations must cover the LP, starter grants, and locked treasury; the example does not authorize additional minting during play.

## Incentive result

With a 1,000 MockUSD prize and 10 MockUSD entry, one wallet completing the whole round would spend about **217.580436 MockUSD** in this isolated example, excluding gas, NFT value, and starter-token resale. It would receive the whole 1,000 MockUSD prize. The difference is about **782.419564 MockUSD**.

This is a sponsor subsidy and a reason for a well-funded player or bot to complete the round. It is not proof of broad participation, fairness, Sybil resistance, or self-sustaining economics. The example does not guarantee this result with other participants or market activity.

Prize escrow must remain fully funded independently of token price and LP proceeds. Fixed-price resets can change who prefers to attack early or late within a stage. A liveness/accounting proof does not establish that players will choose the desired behavior.

At a completed round, the nominal reward is `1,000 / 1,800 = 0.555556 MockUSD/HP`. Even the most expensive marginal HP at the final endpoint costs approximately `1.211659 / 0.997 * 0.108450 / 0.997 = 0.132196 MockUSD` under this supply model, excluding gas and entry. The example therefore rewards finishing the expensive end of a stage too, conditional on round completion and successful claims. This supports the subsidy finding; it does not establish participation or prevent one wallet taking most of the prize.

## Rewards follow eligible BossHP

BossHP now represents the right to a share of the prize. Transferring an unredeemed token transfers that right, even if the recipient never attacked. Current token holdings therefore measure current reward entitlement, not the holder's historical damage. A per-wallet damage mapping is unnecessary for token payouts; events can retain the attack history.

Let `S` be minted supply, `Q` the total BossHP actually delivered through player attacks, and `W` the original prize. Freeze `Q` and `W` at final defeat. In the continuous example:

```text
S = 2,000 BossHP
Q = 300 + 600 + 900 = 1,800 eligible BossHP
W = 1,000 MockUSD

S = 1,800 player-held HP
  + 197.291875626880641926 unused reserve HP
  + 2.708124373119358074 HP LP fees

Reward per eligible HP = W / Q = 0.5555555556 MockUSD
```

Neither `totalSupply()` nor a live sum of wallet balances is the denominator. Using the minted 2,000 would give the players only `1,000 * 1,800 / 2,000 = 900 MockUSD`. Excluding reserve addresses from the claim function alone is insufficient: if those tokens can later be withdrawn or transferred to a player address, they become indistinguishable from eligible HP.

For this single-round model, only authenticated player swaps may release protocol HP into public circulation. Once defeated, keep all unissued reserve, HP fee claims, and HP residue under controller custody while `redeemedHP < Q`. LP ownership and recovery routes must enforce this too, including after the ordinary deadline. Any permitted LP recovery must retain its HP component in controlled custody. Claimed HP stays locked permanently. These conditions prevent unused or already-redeemed tokens from entering claims.

The worked no-burn claim proposal is:

```text
claim(q):
    require final defeat and q > 0
    require q <= caller's available BossHP and redeemedHP + q <= Q
    payout = floor(W * q / Q)
    require payout > 0
    redeemedHP += q
    paidReward += payout
    transfer q BossHP from caller into permanent claim custody
    transfer payout MockUSD to caller
```

Use a non-reentrant atomic operation, ordinary fixed-supply tokens without transfer fees or rebasing, and full-precision multiplication/division. All state changes and transfers revert together on failure. Reuse [OpenZeppelin ERC20 and SafeERC20](https://docs.openzeppelin.com/contracts/5.x/api/token/erc20), rather than introducing a custom token standard. An approval may precede the claim.

The holder chooses `q`, or the UI supplies its full available balance. Both `W` and `Q` stay fixed after earlier claims. Token claims are not limited to one per wallet: a wallet may redeem part of its balance or acquire more eligible tokens later. Actual surrender of the tokens prevents their reuse. Direct token donations to the custody address do not increment `redeemedHP` or pay rewards.

| Holder | Eligible HP before claims | Share | Reward, before integer rounding |
| --- | ---: | ---: | ---: |
| Alice | 300 | 16.666667% | 166.666667 MockUSD |
| Bob | 600 | 33.333333% | 333.333333 MockUSD |
| Carol | 900 | 50% | 500 MockUSD |

If Alice transfers 100 HP to Dave, Alice has 200 HP worth about 111.111111 MockUSD and Dave has 100 HP worth about 55.555556. Their total right remains about 166.666667. If Alice instead redeems 100, those tokens enter permanent custody and cannot subsequently be transferred to Dave for a second claim. A `claimed[address]` flag combined with unchanged transferable balances would not prevent that replay.

For redemption quantities `q_1 ... q_n`, the custody and supply rules imply:

```text
sum(q_j) <= Q
sum(floor(W * q_j / Q)) <= W * sum(q_j) / Q <= W
```

Hence payouts cannot exceed the funded prize. Splitting a claim can only preserve or reduce payout through flooring. No promise is made to distribute every MockUSD base unit; residue remains locked. This proves the arithmetic given the custody assumptions, not the correctness of an unimplemented contract.

For an integer example using the prior trace's output quantities, set `Q = 1,800e18 - 3`, `W = 1,000e6`, and redemption lots `300e18 - 1`, `600e18 - 1`, and `900e18 - 1`. Payouts are respectively 166.666666, 333.333333, and 500.000000 MockUSD, leaving 0.000001 MockUSD. Those numbers were recalculated with integer arithmetic; no new EVM claim test is implied.

An alternative is to freeze BossHP transfers at final defeat and allow each eligible holder to claim its frozen balance once. That avoids token surrender but changes transfer behavior. The calculations above use the transferable surrender model unless the user chooses the frozen-balance alternative.

## Historical burn-based real-v4 execution evidence

Keep these observations as evidence of the prior implementation. Its hook took and burned the output; the current design instead returns zero hook delta and lets the router deliver BossHP to the player. A passing result for that new path requires adapting the existing scenario to assert delivered amounts, unchanged supply, and purchase-counter integrity. No new no-burn execution result is claimed here.

One two-wallet Foundry scenario passed against real `PoolManager`, pinned to v4-core commit `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`:

```text
rtk proxy forge test --root /tmp/boss-pool-refill-proof.6qeuKO --match-contract BossRefillProofTest -vv
Result: 1 passed, 0 failed
Local source: /tmp/boss-pool-refill-proof.6qeuKO/test/BossRefillProof.t.sol
```

The scenario includes a partial first hit, stage-clearing attacks, two same-pool resets, and final defeat. Player ROY debts settle before maintenance. Each liquidity increment uses a fresh salt in the same range, leaving prior fees uncollected. No attack spills into the next stage, and maintenance adds no player contribution. Both reset square-root prices move from `87210699426708006962522930182` to `79228162514264337593543950336` (`2^96`, or price 1).

| Stage | Actual HP burn | HP rounding residue | Actual player ROY debit | Actual reset HP debit |
| --- | ---: | ---: | ---: | ---: |
| 1 | 299.999999999999999999 | 0.000000000000000001 | 331.219793595396366740 | 300.902708124373119359 |
| 2 | 599.999999999999999999 | 0.000000000000000001 | 662.439587190792733479 | 601.805416248746238717 |
| 3 | 899.999999999999999999 | 0.000000000000000001 | 993.659380786189100217 | 0 |

The initial LP deposit is exactly 300 HP. Each subsequent incremental deposit is 300.000000000000000001 HP. Measured totals:

```text
BossHP controller spending = 1802.708124373119358078
  = 1799.999999999999999997 actual burn
  + 2.708124373119358081 PoolManager balance (fees and rounding)

ROY player spending = 1987.318761572378200436
  = 990.678402643830532915 controller custody from resets
  + 996.640358928547667521 PoolManager balance (principal and fees)
```

Starting with 10,000 HP, total supply ends at 8200.000000000000000003 HP. The test asserts token conservation across wallets, controller, hook, and PoolManager, as well as actual burns equaling credited contribution. The few-base-unit differences from the continuous equations are consistent with integer rounding in this trace.

This establishes the core accounting path for one token ordering, tick range, fixed fee, zero protocol fee, and game-owned liquidity. It is a local prototype using test deployment helpers, not a deployed production hook. Production authorization, LP restrictions, different configurations, arbitrary attack fragmentation, the MockUSD supply hop, NFTs, claims, and Robinhood deployment remain outside this evidence. The earlier adjacent-range baseline is preserved in [HP lifecycle](hp-lifecycle.md).
