# Boss Pool

Physical and magic attacks buy and burn ammunition through Uniswap v4. A shared hook runs a three-stage boss and awards a sponsor-funded prize by effective damage.

廣東話 pitch：揀物理定魔法，一按 Attack 自動買入並 burn；hook 扣血、轉形態，打贏按有效傷害分獎。

## Project status

This repository contains the detailed plan and teammate issues. It does not yet contain an implemented application, deployed contracts, or passing integration tests.

The team confirmed these choices on 25 September 2026:

- Bun, TypeScript, viem, Uniswap v4, and Robinhood Chain testnet, chain ID `46630`.
- Two attack tokens and two pools. Proposed symbols are physical `ROY` and magic `MROY`, each paired with `MockUSD`.
- The primary **Attack** action buys the selected ammunition and burns it in one transaction after any required approval.
- Physical damage multiplier is 1. Magic damage multiplier is 3. Rewards use actual effective damage. Volume gives no reward weight.
- Separate stage HP: **300 → 600 → 900**. One attack cannot damage the next stage. Excess purchased tokens remain in the player's wallet.
- MockUSD is a test asset. The 1,000 MockUSD prize has no real-dollar backing.
- Two delivery roles: contracts + backend, and UI + interface + gaming.

## Start here

| Document | Purpose |
| --- | --- |
| [Requirements](docs/requirements.md) | Confirmed rules, user journeys, fixture economics, and scope |
| [Technical specification](docs/technical-spec.md) | Two-pool architecture, atomic settlement, stage math, interfaces, and tests |
| [Delivery plan](docs/delivery-plan.md) | GitHub issues, dependencies, two-person work allocation, and demo schedule |
| [Source notes](docs/sources.md) | Verified sponsor requirements and protocol references |
| [Uniswap feedback draft](FEEDBACK.md) | Observed friction and implementation feedback still to collect |

Start at [the parent epic](https://github.com/0xroylee/eth-global-2026-tokyo/issues/1) or [the demo milestone](https://github.com/0xroylee/eth-global-2026-tokyo/milestone/1). Claim work through the linked issues. Each feature issue includes end-to-end behavior, acceptance criteria, test evidence, and blockers. Suggested roles are not GitHub assignees.

## Technical approach

One BossHook serves the ROY / MockUSD and MROY / MockUSD pools. A dedicated AttackRouter executes an exact-input buy. In `afterSwap`, the hook takes and burns the accepted ammunition, applies stage-capped damage, and returns the corresponding output delta. Unused output goes to the player. Failed settlement reverts both the attack and the trade.

The hook's shared stage also sets dynamic fees for both pools. Contracts own HP, contribution, stage, and claim state. Bun services and the frontend only display chain facts.

Solidity with Foundry is the proposed contract toolchain. React with Vite is the proposed frontend. These complement the confirmed Bun / TypeScript / viem stack.

V3 can host game logic in external contracts. Our claim is that v4 hooks integrate burn accounting and shared boss state into the swap lifecycle. We do not claim games or atomic workflows are impossible on V3.

## Submission target

The [Tokyo Uniswap Foundation track](https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation) has a $6,000 standard-track total, split $3,000 / $2,000 / $1,000. The separate $4,000 track requires Continuity eligibility.

Submission requires public open-source code, `FEEDBACK.md`, and the [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback) linking that file. Add actual contract line permalinks, deployment evidence, and successful attack/claim receipts before submission. Those implementation checks are still open.
