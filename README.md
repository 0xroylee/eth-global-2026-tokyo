# Boss Pool

Players spend MockUSD through the supply pool to buy ROY, then BossHP through Uniswap v4. The Hook counts actual BossHP output as damage without burning tokens. Each defeated stage unlocks a new allocation of BossHP liquidity. After final defeat, eligible BossHP represents a share of the sponsor-funded prize.

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
- Next.js App Router, TypeScript, Tailwind CSS, and direct viem are the selected frontend stack. The current target network is Base Sepolia, chain `84532`. Robinhood testnet `46630` remains supported only for historical deployment and receipt reads. See the [frontend architecture](docs/technical-spec.md#frontend-architecture) and [migration sequence](docs/delivery-plan.md#frontend-build-sequence).

## Status

The private Bun workspace, generated contract client, and local deployment flow are in place. Five focused Foundry cases pass for direct no-entry attacks, both token orderings, quote non-persistence, deadline guards, and expiry. The Next.js arena uses `@boss-pool/chain` for public reads and quotes, direct attack actions, and receipt recovery. Base Sepolia is configured as the active target, but no Boss Pool deployment is verified there. The prior local 18-transaction journey and Robinhood 16+2 receipts used enrollment-era contracts and are historical evidence only. A fresh local direct-attack SDK journey passed with 14 successful transactions at commit `3450be7`. See the [contract usage guide](docs/contract-usage.md), [SDK verification record](docs/sdk-verification.md), and [historical foundation report](docs/testnet-verification.md). Expiry and prize refund have local Foundry coverage only.

The app uses Next.js App Router, Tailwind CSS, direct viem, and Phaser. Manual browser-wallet popup checks remain separate from automated local and testnet verification. See [apps/web/AGENTS.md](apps/web/AGENTS.md) for frontend rules.

The 1,000 MockUSD prize is a test fixture. [Refill math](docs/refill-math.md) gives candidate prices and reserve amounts, with the no-burn accounting change distinguished from historical test evidence. Earlier ROY/MROY allocation tables and price-impact estimates are superseded.

## Read and claim work

| Document | Purpose |
| --- | --- |
| [Agent instructions](AGENTS.md) | Reuse first, focused E2E/core checks, scoped guidance, and current task-specific model routing |
| [Domain context](CONTEXT.md) | ROY, BossHP, effective damage, stage reserve, and prize terminology |
| [Requirements](docs/requirements.md) | Confirmed gameplay and proposed bounded defaults |
| [Technical specification](docs/technical-spec.md) | Atomic two-hop settlement and stage LP control |
| [Contract usage guide](docs/contract-usage.md) | Local deployment, SDK operations, rewards, and current testnet status |
| [SDK verification](docs/sdk-verification.md) | Local and testnet SDK results, browser checks, and wallet-popup checklist |
| [Foundation testnet report](docs/testnet-verification.md) | Historical deployment and exercise evidence from the earlier fixture |
| [Economy](docs/economy.md) | Separate ROY/BossHP budgets and the new proof gate |
| [HP lifecycle](docs/hp-lifecycle.md) | Purchase counters, clearing evidence, and stage release |
| [Refill math](docs/refill-math.md) | Prices, reserve funding, and historical core test evidence |
| [Contract/game diagrams](docs/contract-game-diagrams.md) | No-burn attacks, stage release, and token reward custody |
| [Detailed delivery plan](docs/delivery-plan.md) | Current issue scopes, owners, dependencies, checkpoints and verification |
| [Sources](docs/sources.md) | Official references and limits of the available evidence |
| [Feedback draft](FEEDBACK.md) | Observations to complete during implementation |

Start with [the epic](https://github.com/0xroylee/eth-global-2026-tokyo/issues/1) and [BP01](https://github.com/0xroylee/eth-global-2026-tokyo/issues/2). The 14 child issues retain their identifiers with current BossHP scopes: 10 core, two optional, and two backlog. The detailed plan separates local feasibility from the Base Sepolia release gate.

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

Select Local in the app's network menu to read `apps/web/public/deployments/local.json`. The browser validates that manifest against the local chain and shows a clear not-deployed state when no verified manifest exists. The manifest is generated by a real local deployment; never add sample addresses or browser private keys. Use `bun run local:smoke` to check the same deployed hook state from the terminal.

Run `bun run contracts:test` for the shared core fixture and `bun run abi:check` to detect stale generated ABI. Local seeding creates a new deployment without resetting an existing node. The recorded manifest belongs to the current local instance; regenerate it on a fresh node.

## Workspace layout

```text
contracts/       Solidity, Foundry, deployment artifacts
apps/web/        Next.js + Tailwind player arena, wallet actions, and Phaser scenes
packages/chain/  Generated ABIs, public manifests, viem helpers/types
scripts/         Seed, focused liquidity/E2E scenario, smoke commands
```

Use one Bun lockfile and a private `@boss-pool/chain` workspace. Foundry owns Solidity. Start with direct chain access. No separate backend service, Turbo, Nx, or database is required.

## Submission

The [Uniswap Foundation prize page](https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation) requires public open-source code, FEEDBACK.md, and the [developer feedback form](https://developers.uniswap.org/hackathon-feedback). Its standard track totals $6,000, split $3,000 / $2,000 / $1,000. Continuity eligibility is unverified.

Local Foundry and Anvil runs verify the two-hop attack, Hook purchase accounting, stage refills, reward custody, and settled deltas. Historical Robinhood evidence combines 16 successful gameplay receipts with two separately confirmed victory-NFT claims. The original process stopped on an RPC pinned-block read before NFT calls, so these are two runs, not an uninterrupted 18-transaction run. The team deployed its own non-production PoolManager from pinned v4-core source. It is not an official Robinhood deployment. Base Sepolia has no verified Boss Pool deployment yet. Expiry and prize refund remain local-only evidence.
