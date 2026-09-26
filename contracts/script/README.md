# Local deployment

Start the task-owned Anvil node from the repository root with `bun run local:node`, then run `bun run local:seed`. The runner refuses non-local RPC URLs and any chain ID other than 31337. It uses Anvil's unlocked development sender and does not reset or stop a running node.

`DeployBossPool.s.sol` deploys the pinned v4 `PoolManager`, fixed-supply ROY and BossHP, local MockUSD, collectibles, router, and the permission-mined BossHook. It seeds the MockUSD/ROY pool in the tested 12,000-tick range around the token-order-aware start tick, funds the 1,000 MockUSD prize, and activates stage 1. Parameters match the BP01 shared fixture; they are not testnet deployment claims.

Raw Boss pool ticks follow currency order: `[0, 1920]` when BossHP is currency0 and `[-1920, 0]` when BossHP is currency1. The deployment summary records the Hook's actual tick and square-root price getters, preserving the same ROY-per-BossHP band in both cases.

The script prints a `BOSS_POOL_DEPLOYMENT_JSON=` summary containing the actual deployed addresses, pool keys and IDs, hook flags, stage capacities, initial liquidity, and custody balances. The Bun runner combines that summary with Foundry's successful router creation receipt, verifies contract code on the local RPC, and only then writes `apps/web/public/deployments/local.json`. No private key or credentialed RPC URL is written to the manifest or browser bundle.
