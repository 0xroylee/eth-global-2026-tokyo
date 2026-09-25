# Boss Pool

Players spend ROY to buy BossHP through Uniswap v4. The hook counts actual BossHP purchases as damage without burning tokens. Each defeated stage unlocks a new allocation of BossHP liquidity. After final defeat, eligible BossHP represents a share of the sponsor-funded prize.

廣東話 pitch：MockUSD 買 ROY，ROY 換 BossHP；hook 累計買入 HP 當傷害，清一階先放下一階流動性，打贏按貢獻分獎。

## Current direction

The user confirmed this replacement for the earlier physical/magic design:

- Supply pool: **MockUSD / ROY**.
- Boss pool: **ROY / BossHP**, with BossHP as a real ERC-20.
- Primary Attack executes both swaps in one unlock. ROY is payment into the Boss pool; it is not burned by the attack.
- BossHook accumulates actual BossHP output in `stageSold`. The router delivers BossHP to the player through ordinary settlement; no token burn or output-return delta is needed for damage.
- Stage HP stays **300 → 600 → 900**. Clear the current sellable allocation, perform the controller-only price reset, then add the next stage's incremental liquidity. One attack cannot damage two stages.
- Player BossHP sell-backs into the battle pool are disabled. Transfers do not deal new damage. The worked reward proposal lets eligible token transfers carry reward rights, then locks surrendered tokens at claim. Protocol reserve and fee HP remain excluded. See [reward math](docs/refill-math.md#rewards-follow-eligible-bosshp).
- No MROY, magic-price multiplier, or parallel physical/magic pools.
- Bun, TypeScript, viem, Solidity/Foundry, Uniswap v4, and Robinhood testnet remain the stack. A small Bun monorepo remains the plan.

## Status

This repository contains the plan and teammate issues, not an implemented application. Local real-v4 scenarios proved the previous burn-based stage and refill paths. The current purchase-accounting path has not yet been executed in that fixture. BP01 must adapt the shared scenario and prove the full two-hop route before deployment.

The 1,000 MockUSD prize is a test fixture. [Refill math](docs/refill-math.md) gives candidate prices and reserve amounts, with the no-burn accounting change distinguished from historical test evidence. Earlier ROY/MROY allocation tables and price-impact estimates are superseded.

## Read and claim work

| Document | Purpose |
| --- | --- |
| [Agent instructions](AGENTS.md) | Reuse first, focused E2E/core checks, scoped guidance, Sol high / Luna xhigh |
| [Domain context](CONTEXT.md) | ROY, BossHP, effective damage, stage reserve, and prize terminology |
| [Requirements](docs/requirements.md) | Confirmed gameplay and proposed bounded defaults |
| [Technical specification](docs/technical-spec.md) | Atomic two-hop settlement and stage LP control |
| [Economy](docs/economy.md) | Separate ROY/BossHP budgets and the new proof gate |
| [HP lifecycle](docs/hp-lifecycle.md) | Purchase counters, clearing evidence, and stage release |
| [Refill math](docs/refill-math.md) | Prices, reserve funding, and historical core test evidence |
| [Contract/game diagrams](docs/contract-game-diagrams.md) | No-burn attacks, stage release, and token reward custody |
| [Detailed delivery plan](docs/delivery-plan.md) | Current issue scopes, owners, dependencies, checkpoints and verification |
| [Sources](docs/sources.md) | Official references and limits of the available evidence |
| [Feedback draft](FEEDBACK.md) | Observations to complete during implementation |

Start with [the epic](https://github.com/0xroylee/eth-global-2026-tokyo/issues/1) and [BP01](https://github.com/0xroylee/eth-global-2026-tokyo/issues/2). The 14 child issues retain their identifiers with current BossHP scopes: 10 core, two optional, and two backlog. A starts the shared real-v4 proof/workspace while B prepares the arena and agrees the shared view/event shapes. The detailed plan separates local feasibility from the Robinhood release gate.

## Planned monorepo

```text
contracts/       Solidity, Foundry, deployment artifacts
apps/web/        Arena, wallet interface, game presentation
packages/chain/  Generated ABIs, public manifests, viem helpers/types
scripts/         Seed, focused liquidity/E2E scenario, smoke commands
```

Use one Bun lockfile and a private `@boss-pool/chain` workspace. Foundry owns Solidity. Start with direct chain access. No separate backend service, Turbo, Nx, or database is required.

## Submission

The [Uniswap Foundation prize page](https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation) requires public open-source code, FEEDBACK.md, and the [developer feedback form](https://developers.uniswap.org/hackathon-feedback). Its standard track totals $6,000, split $3,000 / $2,000 / $1,000. Continuity eligibility is unverified.

The intended v4 evidence is a real two-hop attack, hook purchase accounting, stage refill/LP activation, and fully settled deltas. Add actual contract line links, receipts, and focused test evidence after implementation. Do not claim that V3 cannot run games or atomic workflows.
