# Uniswap developer feedback

Status: local-implementation draft, updated 27 September 2026. BP01 has four passing real-v4 core cases, an actual Anvil deployment and a verified read-only arena. The complete browser attack/claim journey and Robinhood deployment are not verified. Historical burn proofs are separate evidence. The feedback form has not been submitted.

## What we are building

Boss Pool routes MockUSD through the Attack Token supply pool to the Attack Token/BossHP battle pool. The battle hook counts actual BossHP output as stage damage. Tokens go to players without burning and represent reward rights. After stage clearance, the router performs a reserve-funded price reset and incremental LP addition in the same unlock. The candidate fee is fixed. After final defeat, Factory claims use recorded attack credit to pay a proportional share of the sponsor prize.

## Observations so far

- The deployment table lists Robinhood mainnet but does not list Robinhood testnet in its testnet section. A documented path for deploying a supported development stack on a new testnet would help.
- Probes of Robinhood's documented testnet RPC returned HTTP 403 from our planning environment on 25 and 26 September. This is a network-access observation, not a Uniswap contract failure. An alternative supported endpoint still needs testing.
- The earlier local stage proof found that integer rounding could leave no sellable HP just before the exact terminal sqrt price. Its remaining-inventory check progressed where strict endpoint equality did not. This is a game integration lesson, not evidence of a v4 bug.
- Callback self-call suppression and actor-specific currency deltas matter for this design. The router settles the player's trade before reserve maintenance so recovered Attack Token cannot be mistaken for a player refund. The local no-burn fixture now checks this path and failed-transition rollback.
- Real deployment exposed a token-order pricing error: using raw ticks [0,1920] for HP1 inverted the intended Attack Token/HP band. Mirroring HP1 to [-1920,0] restores the same human-unit prices as HP0. The reverse HP1 refill splits at bitmap boundary -60 for tick spacing 60, so its reserve quote rounds each interval separately. These are integration lessons, not evidence of a v4 bug.

## Evidence to add

- Dependency commits, compiler settings, chain ID, and deployment provenance.
- Time to the first successful swap, first two-hop HP delivery, first same-pool stage reset and first HP redemption.
- Transaction links and any failing test or minimal reproduction.
- Friction around currency orientation, delta signs, callback identity, hook flags, authenticated quoting, staged positions and token-reward custody.
- One prioritized improvement based on the team's implementation experience.

## Submission

The submission owner completes the [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback) with a public link to this file and records confirmation in the submission issue. Publishing this draft alone does not complete that requirement.
