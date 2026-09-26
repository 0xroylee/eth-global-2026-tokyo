# Boss Pool

The standalone game uses MockUSD to buy ROY, then BossHP through Uniswap v4. The permissionless Boss Factory lets a creator choose an existing MEME, an allocation, a prize percentage, and a MockUSD volume target. It derives an initial price and releases a separate MEME pool stage at each 1:2:3 volume gate. Winners claim a share of the MEME prize allocation.

廣東話 pitch：MockUSD 買 ROY，ROY 換 BossHP；hook 累計買入 HP 當傷害，清一階先放下一階流動性，打贏按貢獻分獎。

## Current direction

The user confirmed this replacement for the earlier physical/magic design:

- Supply pool: **MockUSD / ROY**.
- Boss pool: **ROY / BossHP**, with BossHP as a real ERC-20.
- Players connect, approve MockUSD to BossRouter when needed, and press Attack. No enrollment fee or entry NFT is required.
- Primary Attack executes both swaps in one unlock. ROY is payment into the Boss pool; it is not burned by the attack.
- BossHook accumulates actual BossHP output in `stageSold`. The router delivers BossHP to the player through ordinary settlement; no token burn or output-return delta is needed for damage.
- Stage HP stays **300 → 600 → 900**. Clear the current sellable allocation, perform the controller-only price reset, then add the next stage's incremental liquidity. One attack cannot damage two stages.
- Player BossHP sell-backs into the battle pool are disabled. Transfers do not deal new damage. The worked reward proposal lets eligible token transfers carry reward rights, then locks surrendered tokens at claim. Protocol reserve and fee HP remain excluded. See [reward math](docs/refill-math.md#rewards-follow-eligible-bosshp).
- No MROY, magic-price multiplier, or parallel physical/magic pools.
- Next.js App Router, TypeScript, Tailwind CSS, and direct viem are the selected frontend stack. Bun, Solidity/Foundry, Uniswap v4, and Base Sepolia are the current contract development stack. See the [frontend architecture](docs/technical-spec.md#frontend-architecture) and [migration sequence](docs/delivery-plan.md#frontend-build-sequence).

## Status

The private Bun workspace, minimal read-only Vite arena, generated contract client, and local deployment flow are in place. The shared real-v4 Foundry fixture passes eight focused scenarios, including volume-gated factory stages, MEME prizes, and atomic rollback. The reusable local Anvil exercise completes both wallets through the standalone BossHP stages, claims, and victory NFTs. A historical team deployment completed the full two-wallet journey on Robinhood testnet. The active testnet target is Base Sepolia and needs its own deployment and verification. See the [contract usage guide](docs/contract-usage.md) and [testnet verification report](docs/testnet-verification.md). The browser remains read-only; expiry and prize refund have local Foundry coverage only.

The arena shell now runs on Next.js App Router and Tailwind CSS; the read-only round state, deployment validation, and not-deployed/error states are preserved from BP01. Direct viem wallet connection and the Phaser hub/battle scenes are the next frontend slices. See [apps/web/AGENTS.md](apps/web/AGENTS.md) for frontend rules.

The 1,000 MockUSD prize is a test fixture. [Refill math](docs/refill-math.md) gives candidate prices and reserve amounts, with the no-burn accounting change distinguished from historical test evidence. Earlier ROY/MROY allocation tables and price-impact estimates are superseded.

## Read and claim work

| Document | Purpose |
| --- | --- |
| [Agent instructions](AGENTS.md) | Reuse first, focused E2E/core checks, scoped guidance, and current task-specific model routing |
| [Domain context](CONTEXT.md) | ROY, BossHP, effective damage, stage reserve, and prize terminology |
| [Requirements](docs/requirements.md) | Confirmed gameplay and proposed bounded defaults |
| [Technical specification](docs/technical-spec.md) | Atomic two-hop settlement and stage LP control |
| [Contract usage guide](docs/contract-usage.md) | Local deployment, player calls, rewards, reads, and testnet status |
| [Boss Factory](docs/boss-factory.md) | Permissionless meme-token bosses, launch configuration, prize credit, and creator withdrawals |
| [Testnet verification](docs/testnet-verification.md) | Verified team deployment and outstanding exercise evidence |
| [Economy](docs/economy.md) | Separate ROY/BossHP budgets and the new proof gate |
| [HP lifecycle](docs/hp-lifecycle.md) | Purchase counters, clearing evidence, and stage release |
| [Refill math](docs/refill-math.md) | Prices, reserve funding, and historical core test evidence |
| [Contract/game diagrams](docs/contract-game-diagrams.md) | No-burn attacks, stage release, and token reward custody |
| [Detailed delivery plan](docs/delivery-plan.md) | Current issue scopes, owners, dependencies, checkpoints and verification |
| [Sources](docs/sources.md) | Official references and limits of the available evidence |
| [Feedback draft](FEEDBACK.md) | Observations to complete during implementation |

Start with [the epic](https://github.com/0xroylee/eth-global-2026-tokyo/issues/1) and [BP01](https://github.com/0xroylee/eth-global-2026-tokyo/issues/2). The 14 child issues retain their identifiers with current BossHP scopes: 10 core, two optional, and two backlog. A starts the shared real-v4 proof/workspace while B prepares the arena and agrees the shared view/event shapes. The detailed plan separates local feasibility from the Robinhood release gate.

## Workspace setup

Use Bun and Foundry with Solidity 0.8.26/Cancun support. Initialize the pinned Solidity submodules, install workspace dependencies, and compile/export the ABI:

```sh
git submodule update --init --recursive
bun install
bun run abi:export
bun run typecheck
bun run web:build
```

Run the local node, deployment seed, and web app in separate terminals:

```sh
bun run local:node
bun run local:seed
bun run web:dev
```

The arena reads contract state only when `apps/web/public/deployments/local.json` exists and validates against the local chain. It shows a clear not-deployed state otherwise. The manifest is generated by a real local deployment; never add sample addresses or browser private keys. Use `bun run local:smoke` to check the same deployed hook state from the terminal.

Run `bun run contracts:test` for the shared core fixture and `bun run abi:check` to detect stale generated ABI. Local seeding creates a new deployment without resetting an existing node. The recorded manifest belongs to the current local instance; regenerate it on a fresh node.

## Workspace layout

```text
contracts/       Solidity, Foundry, deployment artifacts
apps/web/        Next.js + Tailwind arena (read-only round state today; hub and battle scenes next)
packages/chain/  Generated ABIs, public manifests, viem helpers/types
scripts/         Seed, focused liquidity/E2E scenario, smoke commands
```

Use one Bun lockfile and a private `@boss-pool/chain` workspace. Foundry owns Solidity. Start with direct chain access. No separate backend service, Turbo, Nx, or database is required.

## Submission

The [Uniswap Foundation prize page](https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation) requires public open-source code, FEEDBACK.md, and the [developer feedback form](https://developers.uniswap.org/hackathon-feedback). Its standard track totals $6,000, split $3,000 / $2,000 / $1,000. Continuity eligibility is unverified.

Local Foundry and Anvil runs verify the two-hop attack, Hook purchase accounting, stage refills, reward custody, and fully settled deltas. Historical Robinhood testnet receipts cover deployment and the full player journey; they do not verify the active Base Sepolia target. Expiry/refund remains local-only evidence. Do not present the team PoolManager as an official deployment or claim that V3 cannot run games or atomic workflows.
