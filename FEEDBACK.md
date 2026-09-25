# Uniswap developer feedback

Status: planning-stage draft. Boss Pool has not yet been deployed or tested. Update this file with actual implementation experience before submission. The feedback form has not been submitted.

## What we are building

Boss Pool uses two v4 pools for physical and magic attack tokens. The shared hook consumes ammunition from swap output, burns the actual ERC-20, and records stage-capped damage and reward contribution. Its shared stage changes dynamic fees in both pools.

## Observations so far

- The deployment table lists Robinhood mainnet but does not list Robinhood testnet in its testnet section. A documented path for deploying a supported development stack on a new testnet would help.
- A probe of Robinhood's documented testnet RPC returned HTTP 403 from our planning environment. This is a network-access observation, not a Uniswap contract failure. An alternative supported endpoint still needs testing.
- This integration must distinguish the ammunition ERC-20 burn from `PoolManager.burn`, which burns ERC-6909 accounting claims. An example pairing output-side hook deltas with an actual ERC-20 burn would help.

## Evidence to add

- Dependency commits, compiler settings, chain ID, and deployment provenance.
- Time to the first successful swap and first atomic buy-and-burn in each pool.
- Transaction links and any failing test or minimal reproduction.
- Friction around currency orientation, delta signs, callback identity, hook flags, quoting, shared-pool state, or fee overrides.
- One prioritized improvement based on the team's implementation experience.

## Submission

The submission owner completes the [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback) with a public link to this file and records confirmation in the submission issue. Publishing this draft alone does not complete that requirement.
