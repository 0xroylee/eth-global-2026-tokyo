# Deployment and local exercise commands

`DeployBossPool.s.sol` deploys its own pinned v4 `PoolManager`, fixed-supply ROY and BossHP, MockUSD, collectibles, Router, and permission-mined Hook. The script seeds the MockUSD/ROY pool, funds a 1,000 MockUSD fixture prize, and activates stage 1. Boss pool ticks are derived from the actual Hook getters: `[0, 1920]` when BossHP is currency0 and `[-1920, 0]` when BossHP is currency1. The summary records both pool keys and IDs, stage configuration, and actual custody balances.

The same deployment script supports two guarded environments:

- **Local Anvil, chain 31337:** `bun run local:seed` accepts only a loopback RPC and uses Anvil's unlocked development sender. It does not start, reset, or stop a node. Its default manifest is `apps/web/public/deployments/local.json`.
- **Robinhood testnet, chain 46630:** `bun run testnet:preflight` is read-only. It checks chain ID, Cancun transient storage, signer balances, a pinned Forge gas estimate, and whether the signer nonce is settled at the chosen fork block. `bun run testnet:deploy` is the separate broadcast path. It requires committed, clean contract/deployment sources and pinned dependencies, rechecks signer funds immediately before broadcast, and verifies deployed code, contract identities, active stage-0 state, prize funding, and locked token custody before writing `apps/web/public/deployments/robinhood-testnet.json`.

The testnet deployment is classified as **TEAM_DEPLOYED_NON_PRODUCTION**. It deploys a PoolManager from the repository's pinned v4-core source; no official Robinhood PoolManager address is assumed. The verified deployment manifest records block 124390450 and successful transaction receipt metadata. This is test infrastructure, not a production deployment.

For testnet commands, keep `ROBINHOOD_RPC_URL`, `TESTNET_DEPLOYER_PRIVATE_KEY`, and `TESTNET_PLAYER_PRIVATE_KEY` in ignored `.env.testnet.local`. Do not put key values in command arguments, source files, manifests, logs, or the browser bundle. The deployer is player A; the second key is player B.

Load that file through Bun without putting secret values in the shell command:

```sh
bun --env-file=.env.testnet.local run testnet:preflight
bun --env-file=.env.testnet.local run testnet:deploy
bun --env-file=.env.testnet.local run testnet:exercise
```

The testnet exercise sends transactions from both test wallets. It enrolls both players, attacks across all three stages, verifies refills and settlement, transfers eligible BossHP, claims rewards, and claims victory NFTs. Run it only against the verified manifest and funded test-only wallets.

If Forge completes a deployment but the endpoint has not exposed the final setup block yet, the deploy runner preserves a sanitized pending summary and receipt list under ignored `.scratch/`. Recover it with a read-only command; it verifies the existing receipts and pinned final setup block, then publishes the manifest without broadcasting again:

```sh
bun --env-file=.env.testnet.local scripts/testnet-deploy.ts --verify-pending
```

The normal deploy command refuses to broadcast while a pending summary exists.

For local exercise evidence without replacing the checked-in local manifest, run a separate Anvil on port 8548, then use a scratch manifest path:

```sh
export LOCAL_RPC_URL=http://127.0.0.1:8548
export LOCAL_DEPLOYMENT_PATH=.scratch/deliver-code/contract-guide-testnet/local-deployment.json
```

Load these public local settings through a temporary env file or a shell environment, then run `bun run local:seed`, `bun run local:smoke`, and `bun run local:exercise`. An override path is accepted only under `.scratch/`; without it, `local:seed` updates the default local manifest. Local commands are guarded to chain 31337 and do not reset a running node.
