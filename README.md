# Boss BoostPad

Boss BoostPad creates a token pool and turns it into a boss raid on Uniswap v4. The creator already holds the token. Fighters swap to attack, so each attack adds to that token's swap volume, and they share the creator-funded prize. Clearing a stage unlocks the next liquidity.

廣東話 pitch：Boss BoostPad 為已有代幣開一個池，再變成 Boss 戰。攻擊就係 swap，所以每一下攻擊都增加該幣嘅成交量。打贏之後戰士分創建者放嘅獎。清一階先放下一階流動性。

## Public description

Demo: https://web-smoky-tau-35.vercel.app/

**Short:** Boss BoostPad turns a token pool into a boss raid. Fighters swap to attack and share the prize.

**Description:** A token sitting in a normal pool gives traders nothing to defeat and no shared prize. Boss BoostPad creates a pool for a token the creator already holds and turns that pool into a boss raid on Uniswap v4. The creator sets the pool in the blacksmith: pool size, a volume target, a prize share, and a portrait for each stage. Fighters attack by swapping through the pools, so each attack adds to that token's swap volume. Swaps outside the fight do not count. Clearing a stage unlocks the next liquidity. After the final stage, eligible fighters share the creator-funded prize. The garden hub, workshop, and battle run in the browser.

**How it's made:** The boss is a Uniswap v4 hook. An attack is one routed swap, from MockUSD through Attack Token into the creator's existing token, and the hook counts that swap as damage and volume. The Boss Factory contract creates the pool, escrows the creator-funded prize, and releases the next stage's liquidity when the current stage is cleared. The browser app is Next.js and Phaser: a walkable garden hub, a blacksmith workshop where the creator sets the pool, and a turn-based battle. Wallet calls use viem on Base Sepolia. The hook is the notable part: swap output is the attack, with no token burn and no separate damage ledger.

## Current direction

The user confirmed this replacement for the earlier physical/magic design:

- Supply pool: **MockUSD / Attack Token**.
- Boss pool: **Attack Token / BossHP**, with BossHP as a real ERC-20.
- Players connect, approve MockUSD to BossRouter when needed, and press Attack. No enrollment fee or entry NFT is required.
- Primary Attack executes both swaps in one unlock. Attack Token is payment into the Boss pool; it is not burned by the attack.
- BossHook accumulates actual BossHP output in `stageSold`. The router delivers BossHP to the player through ordinary settlement; no token burn or output-return delta is needed for damage.
- Stage HP stays **300 → 600 → 900**. Clear the current sellable allocation, perform the controller-only price reset, then add the next stage's incremental liquidity. One attack cannot damage two stages.
- Player BossHP sell-backs into the battle pool are disabled. Transfers do not deal new damage. The worked reward proposal lets eligible token transfers carry reward rights, then locks surrendered tokens at claim. Protocol reserve and fee HP remain excluded. See [reward math](docs/refill-math.md#rewards-follow-eligible-bosshp).
- Permissionless Boss Factory rounds let creators select an existing MEME, its allocation, a prize percentage, and a MockUSD volume target. The contract derives the start price and unlocks three MEME stages at 1:2:3 volume gates. See [Boss Factory](docs/boss-factory.md).
- No MROY, magic-price multiplier, or parallel physical/magic pools.
- Next.js App Router, TypeScript, Tailwind CSS, and direct viem are the selected frontend stack. The app offers Base Sepolia, chain `84532`, and Local Anvil, chain `31337`. Robinhood testnet `46630` remains available through the SDK for historical deployment and receipt reads. See the [frontend architecture](docs/technical-spec.md#frontend-architecture) and [migration sequence](docs/delivery-plan.md#frontend-build-sequence).

## Status

The private Bun workspace, generated contract client, and local deployment flow are in place. The shared real-v4 Foundry fixture covers standalone attacks, public quotes, and volume-targeted Boss Factory launches. The Next.js arena and `@boss-pool/chain` SDK support public reads, direct-attack quotes, player transactions, and Factory launches. The creator form is available at `/launch` and reads the deployed Base Sepolia Factory address from the deployment manifest. The corrected Factory is deployed and configured on Base Sepolia. Its first demo boss was created through `launchBoss` and has verified funding, current contract bytecode, and a working attack quote. The player fight flow for Factory bosses remains outstanding. See the [contract usage guide](docs/contract-usage.md), [Boss Factory](docs/boss-factory.md), [SDK verification record](docs/sdk-verification.md), and [historical foundation report](docs/testnet-verification.md).

The app uses Next.js App Router, Tailwind CSS, direct viem, and Phaser. Manual browser-wallet popup checks remain separate from automated local and testnet verification. See [apps/web/AGENTS.md](apps/web/AGENTS.md) for frontend rules.

The 1,000 MockUSD prize is a test fixture. [Refill math](docs/refill-math.md) gives candidate prices and reserve amounts, with the no-burn accounting change distinguished from historical test evidence. Earlier Attack Token/MROY allocation tables and price-impact estimates are superseded.

## Read and claim work

| Document | Purpose |
| --- | --- |
| [Agent instructions](AGENTS.md) | Reuse first, focused E2E/core checks, scoped guidance, and current task-specific model routing |
| [Domain context](CONTEXT.md) | Attack Token, BossHP, effective damage, stage reserve, and prize terminology |
| [Requirements](docs/requirements.md) | Confirmed gameplay and proposed bounded defaults |
| [Technical specification](docs/technical-spec.md) | Atomic two-hop settlement and stage LP control |
| [Contract usage guide](docs/contract-usage.md) | Local deployment, SDK operations, rewards, and current testnet status |
| [Boss Factory](docs/boss-factory.md) | Permissionless MEME launches, volume quotes, stage gates, and prize claims |
| [SDK verification](docs/sdk-verification.md) | Local and testnet SDK results, browser checks, and wallet-popup checklist |
| [Foundation testnet report](docs/testnet-verification.md) | Historical deployment and exercise evidence from the earlier fixture |
| [Economy](docs/economy.md) | Separate Attack Token/BossHP budgets and the new proof gate |
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

Local Foundry and Anvil runs verify the two-hop attack, Hook purchase accounting, stage refills, reward custody, and settled deltas. Historical Robinhood evidence combines 16 successful gameplay receipts with two separately confirmed victory-NFT claims. The original process stopped on an RPC pinned-block read before NFT calls, so these are two runs, not an uninterrupted 18-transaction run. The team deployed its own non-production PoolManager from pinned v4-core source. It is not an official Robinhood deployment. Base Sepolia has verified standalone and corrected Factory deployments, plus a Factory-created demo boss. The demo boss is active with a verified attack quote; public-chain player transactions for that boss remain untested. Expiry and prize refund remain local-only evidence.
