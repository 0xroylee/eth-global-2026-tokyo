# Robinhood testnet verification

Verified 26 September 2026 on Robinhood Chain Testnet, chain `46630`. This is a team-deployed, non-production fixture. The PoolManager was deployed from the repository's pinned v4-core source. It is not an official Robinhood PoolManager. The [Robinhood deployment documentation](https://docs.robinhood.com/chain/deploy-smart-contracts/) lists the testnet chain and explorer.

## Deployment and setup

The historical foundation addresses, pool keys, configuration, provenance, and all 18 deployment receipts are preserved in [`robinhood-foundation-deployment.json`](evidence/robinhood-foundation-deployment.json). Each deployment and setup receipt was checked against the testnet RPC. Combined deployment and setup gas was `19,595,227`. The app's current deployment manifest can point to a newer fixture; the receipts in this report belong to this archived foundation deployment.

| Receipt | Block | Explorer transaction | Gas |
| --- | ---: | --- | ---: |
| Router creation and manifest anchor | 124390450 | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0xa4e3f50b1f819d6a6244f486ac421417a4bf0d1d4358c78212ec05c39307226e) | 4,790,797 |
| Boss pool initialization, stage 0 liquidity, and activation | 124390616 | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0x8b7566fe18842e56d042f3dc7a7f962ac14d1e8b9077796c9571bb61f9d27f54) | 377,424 |

Deployment source commit: `e63612377295025c0cd450038a44647ab25377f5`. It used `DeployBossPool.s.sol:DeployBossPool`, Solidity `0.8.26`, Cancun EVM, v4-core commit `46c6834698c48bc4a463a86d8420f4eb1d7f3b75`, and OpenZeppelin commit `dbb6104ce834628e473d2173bbc9d47f81a9eec3`.

The live BossHP pool uses BossHP as currency1 and ticks `[-1920, 0]`. Stage 0 began Active at zero-based index `0`. The deployment manifest records the exact pool keys, fixed supply, seeded reserves, capacities, price limits, and Hook flags.

## Two-wallet exercise

The reusable exercise completed with 19 successful player receipts. The first receipt is block `124393774`; the last is `124394012`. The final verified state is block `124394014`. Exercise gas was `3,512,481`. Player A partially attacked stage 0; Player B cleared stage 0; Player A cleared stage 1; Player B cleared stage 2. The two clear transactions each performed one reserve refill and reset the pool to `sqrtPriceX96 = 79228162514264337593543950336` (tick 0, normalized ROY/HP price 1). The last stage defeated the boss without a refill or stage advance.

| Action | Explorer transaction |
| --- | --- |
| Partial attack, stage 0 | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0x5bbbabaad99f9baf920ea71895f178cd724045b20d40ff91771c7eab0d031363) |
| Clear stage 0 and refill stage 1 | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0x29cf16ca539629012fa794cd85bd688a6e5864e70d56c49f5f20dffed1c128f7) |
| Clear stage 1 and refill stage 2 | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0x2dea967bdff275e528654541bbdbad65f62c611e1c4a321d27160586028a9e59) |
| Defeat at stage 2 | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0xd74010c45fc9b836ebf231888b9670a602685fb6bb362f968e2c51d6931e309c) |
| Transfer eligible BossHP from B to A | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0x9c3572199639bb75fe363186bf3899112fa00f6eac62e36c9a0c40c15072b0ff) |
| Partial reward claim | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0xbae2a14ea09cceee677ee5c7d018d865302bd88e51e71ae55b2aa9d8d3094141) |
| Remaining reward claim | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0x9c19d9b802bc006392b013e1b92687904ed0131019a2084c0f214606caea8f46) |
| Player A victory NFT | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0xdfb0ea4abac6e3a0085bf0ec4ae4fff247568f4c78a8313d3f4c350a4f4433da) |
| Player B victory NFT | [Open transaction](https://explorer.testnet.chain.robinhood.com/tx/0x6f22b4fbed9f165f93574121277c607ad8683b3e6c5ee080e6e7ff6bb84ac8f6) |

Each stage's actual `stageSold` output ended one BossHP base unit below its nominal capacity. Capacity remained nominal. The final reward denominator is the sum of actual BossHP outputs, not nominal stage capacity.

| Zero-based stage | Actual `stageSold` | Capacity | Unsold rounding dust |
| ---: | ---: | ---: | ---: |
| 0 | `299999999999999999999` | `300000000000000000000` | 1 base unit |
| 1 | `599999999999999999999` | `600000000000000000000` | 1 base unit |
| 2 | `899999999999999999999` | `900000000000000000000` | 1 base unit |

All integer token amounts in this report are base units. At defeat, `finalEligibleHP` was `1799999999999999999997` and `currentStage` remained `2`. Player B transferred all `1189922146802389035629` BossHP base units to A without changing stage damage. A surrendered `1e18` HP base units for `555555` MockUSD base units, then surrendered the remaining `1798999999999999999997` HP base units for `999444444` base units. `redeemedHP` equaled `finalEligibleHP`; the Hook held all surrendered HP. The two floor-rounded claims paid `999999999` of the `1000000000` base-unit prize, leaving one MockUSD base unit. Victory NFTs `3` and `4` were delivered to A and B independently.

BossHP total supply remained `2000000000000000000000`; ROY total supply remained `100000000000000000000000`. The actual attack receipts also reconcile MockUSD spend and refunds, intermediate ROY refunds, BossHP output delivered to each player, stage counters, and both refills. The full receipt and block-state record is [`evidence/robinhood-testnet.json`](evidence/robinhood-testnet.json). It contains public addresses and transaction data, with signer material and RPC URL omitted.

The first exercise attempt stopped before any writes when one RPC backend rejected a pinned-block read. Before the successful run, the runner added a bounded retry for that read at the same block. Write submissions are not retried.

Exercise source: [`exercise-boss-pool.ts`](../scripts/exercise-boss-pool.ts), commit `7f6fbe4d34ffa757228eac7e21f0a09b473b280c`. Its recorded SHA-256 is `ea250d14446aa4da4d63cf29d41ea939c3a412f82de3fee45d9da87b5852759c`; the runner source file was clean for the run.

## Reproduce

Set `ROBINHOOD_RPC_URL`, `TESTNET_DEPLOYER_PRIVATE_KEY`, and `TESTNET_PLAYER_PRIVATE_KEY` in the ignored `.env.testnet.local` file. The commands use Player A as the deployer and Player B as a separate test wallet. The deployment command creates a new fixture and writes the public manifest only after receipt and code verification. The exercise command consumes the active round and saves checkpoints under ignored `.scratch/boss-pool-exercise/`.

```sh
bun --env-file=.env.testnet.local run testnet:preflight
bun --env-file=.env.testnet.local run testnet:deploy
bun --env-file=.env.testnet.local run testnet:exercise
```

This verified deployment is now Defeated with all eligible HP redeemed. It cannot run through the full journey again. Deploy a new team fixture before another exercise. Expiry and prize-refund behavior have local Foundry coverage only; they have no Robinhood testnet receipts. The browser remains read-only.
