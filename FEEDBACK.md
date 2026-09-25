# Uniswap developer feedback

Status: planning-stage draft, updated 26 September 2026. The current no-burn Boss Pool application has not been deployed or E2E-tested. Historical local burn-based feasibility/refill proofs passed, but do not verify current token delivery/redemption. Update this file with actual implementation experience before submission. The feedback form has not been submitted.

## What we are building

Boss Pool routes MockUSD through a ROY supply pool into a ROY/BossHP battle pool. The battle hook counts actual BossHP output as stage damage. Tokens go to players without burning and represent reward rights. After stage clearance, a separate router/controller performs a reserve-funded price reset and incremental LP addition in the same unlock. The candidate fee is fixed. After final defeat, the proposed claim path permanently locks surrendered HP and pays a fixed share of the sponsor prize.

## Observations so far

- The deployment table lists Robinhood mainnet but does not list Robinhood testnet in its testnet section. A documented path for deploying a supported development stack on a new testnet would help.
- Probes of Robinhood's documented testnet RPC returned HTTP 403 from our planning environment on 25 and 26 September. This is a network-access observation, not a Uniswap contract failure. An alternative supported endpoint still needs testing.
- The earlier local stage proof found that integer rounding could leave no sellable HP just before the exact terminal sqrt price. Its remaining-inventory check progressed where strict endpoint equality did not. This is a game integration lesson, not evidence of a v4 bug.
- Callback self-call suppression and actor-specific currency deltas matter for this design. The router settles the player's trade before reserve maintenance so recovered ROY cannot be mistaken for a player refund. The new no-burn path still needs its own execution evidence.

## Evidence to add

- Dependency commits, compiler settings, chain ID, and deployment provenance.
- Time to the first successful swap, first two-hop HP delivery, first same-pool stage reset and first HP redemption.
- Transaction links and any failing test or minimal reproduction.
- Friction around currency orientation, delta signs, callback identity, hook flags, authenticated quoting, staged positions and token-reward custody.
- One prioritized improvement based on the team's implementation experience.

## Submission

The submission owner completes the [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback) with a public link to this file and records confirmation in the submission issue. Publishing this draft alone does not complete that requirement.
