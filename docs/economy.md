# Ammunition supply and liquidity

Status: accepted design direction with a candidate LP configuration. The candidate is not approved for deployment until the real v4 simulation described below passes.

## Rules for the demo

- Fix the initial supply of both ammunition tokens. There is no active-round minting, stage emission, or automatic market intervention.
- Split supply into LP inventory, starter reserve, and locked treasury. Prize MockUSD and entry proceeds are separate funds.
- Keep treasury ammunition locked until at least the immutable round deadline, even if the boss is defeated early. A fixed unlock time may be later than the deadline.
- Prevent principal liquidity reductions in the two game pools during that same round interval. The implementation mechanism is specified in the technical specification.
- Use the selected v4 pool's active liquidity and price ranges to estimate attack cost. Total token supply does not establish trading depth.
- Preserve input caps, minimum gross output, minimum effective damage, expected stage, and request deadlines. Those bounds protect an attack; they do not stabilize the market.

Use an existing asset timelock implementation for treasury ERC-20s. OpenZeppelin `VestingWallet` supports a fixed release time with zero duration. Bind its unlock time to at least the round deadline and verify that the allocation is actually deposited. It does not lock a v4 LP position or guarantee a price. Long-term team vesting is deferred. [OpenZeppelin finance reference](https://docs.openzeppelin.com/contracts/5.x/api/finance)

## Damage determines burn demand

```text
totalHP = 300 + 600 + 900 = 1,800
all-physical clear = 1,800 ROY
all-magic clear = 600 MROY

initialSupply[token] = lpAllocation[token]
                     + starterReserve[token]
                     + lockedTreasury[token]
```

Contribution remains effective damage, with physical weight 1 and magic weight 3. The damage formula and base-unit rounding live in the [technical specification](technical-spec.md).

HP bounds how much an attack burns, not how many tokens the market can buy. Extra purchased tokens can remain in wallets, and ordinary trades remain possible. Therefore these burn totals are not an upper bound on total buying pressure.

## Candidate allocation

Keep the proposed total supplies and starting prices. Reallocate more existing ammunition into LP instead of increasing supply.

| Allocation | Physical ROY | Magic MROY |
| --- | --- | --- |
| Fixed initial supply | 100,000 | 20,000 |
| Candidate LP ammunition budget | 40,000 | 14,000 |
| Starter reserve | 10,000 | 0 |
| Candidate locked treasury | 50,000 | 6,000 |
| Candidate LP quote budget | 4,000 MockUSD | 7,000 MockUSD |
| Target initial unit price | 0.1 MockUSD | 0.5 MockUSD |

These replace the earlier 10,000 ROY / 1,000 MockUSD and 2,000 MROY / 1,000 MockUSD planning fixtures. Candidate maker quote funding is **12,000 MockUSD**: 11,000 for liquidity plus the separate 1,000 prize. These are test assets, not real-dollar funding commitments.

The actual amounts consumed by v4 positions depend on their ranges, initial price, and rounding. Freeze actual seed amounts after simulation. Put unused ammunition budget into the locked treasury and record the resulting allocation. Do not leave a loose maker ammunition balance outside the declared allocation.

## Illustrative depth calculation

For a fee-free full-range constant-product approximation, let `X` be initial pool ammunition and `B` ammunition bought from that pool:

```text
endSpotPrice / initialSpotPrice = (X / (X - B))^2

For an illustrative end-price increase target u:
X >= B / (1 - 1 / sqrt(1 + u))
```

These are our derived planning calculations. They assume no fees, no other trades, no LP changes, and all purchased ammunition is burned. They are not a guarantee or a calculation from the actual deployed v4 positions.

| All damage through one kind | Old fixture end-price increase | Candidate end-price increase |
| --- | --- | --- |
| Buy and burn 1,800 ROY | 48.72% | 9.65% |
| Buy and burn 600 MROY | 104.08% | 9.16% |

Use roughly 10% terminal spot-price increase as a **candidate baseline target**, not an enforced price band. Real v4 positions use concentrated liquidity, so actual deposits are not interchangeable with virtual reserves or active liquidity. A narrow range can run out of active liquidity. Validate the chosen ranges rather than substituting these numbers into production logic. [Uniswap concentrated liquidity](https://developers.uniswap.org/docs/get-started/concepts/liquidity-providers/concentrated-liquidity)

## Freeze liquidity from one reusable simulation

BP01 owns a local v4 scenario that feeds the existing E2E fixtures. Reuse the pinned pool math and quote/deployment tools. Do not build a separate economics simulator or a broad new test suite.

Record the actual currency order, 6/18-decimal conversion, ticks/ranges, active liquidity, fee schedule, and token allocations. Replay an all-physical clear, an all-magic clear, and the mixed demo sequence against fresh copies of that fixture. Those are configurations of one scenario.

For each sequence, report input spent, gross output, amount burned, leftover ammunition, effective damage, end price, remaining active liquidity, and any failed action. Include the stage-clearing fee rule and base-unit rounding. Use the existing entry allocations; distinguish holding starter tokens from the optional held-burn feature.

Before freezing a deployment, confirm both attack kinds can complete the round with the chosen input bounds and sufficient active liquidity. If the candidate baseline misses the target or leaves the range, adjust LP amounts/ranges or disclose a revised target before activation. Freeze per-attack input limits and the pool configuration in the manifest. The UI must show that bought-but-unburned output is returned as ammunition, not refunded MockUSD.

Ordinary purchases, sales of starter tokens, and post-round treasury releases can change price beyond this baseline. Do not present the baseline target, treasury lock, fee schedule, or slippage setting as guaranteed price stability. The game remains sponsor-funded.
