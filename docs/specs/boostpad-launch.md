# BoostPad live launch

Approved in the 26 September 2026 grilling session. The user confirmed implementation after resolving the decisions below.

Updated for [PR #72](https://github.com/0xroylee/eth-global-2026-tokyo/pull/72), head `d0ad8d87ca5bab80c927e7412bd2a200a75549c5`. Current continuous-liquidity and owner-LP behavior supersedes the earlier staged-refill design. Historical deployment authorization below records that earlier task and does not authorize a new broadcast.

## Behavior

- `/boostpad` uses the existing Blacksmith scene and cream/navy pixel form. Direct visits open the form immediately. `?from=game` retains walking and the E interaction. `/launch` redirects to `/boostpad`.
- Creators enter an existing ERC-20 address, total allocation, MockUSD volume target, and prize percentage. Reuse token metadata/balance reads, funding quotes, exact approvals, launch, and receipt recovery.
- Every new Factory boss has three stages with the existing default cat portraits. Remove stage-count and image selectors.
- A Factory boss stays active until defeated. It has no expiry or cancellation. Its prize, initial LP position, initial-position fees, and Router residue cannot be recovered by the creator, including after defeat. A separate owner-added LP position can be added or removed without reducing the initial liquidity floor or touching player credit and prize escrow. Earned player prizes remain claimable indefinitely.
- All sale liquidity is active at launch along the normal AMM curve. Stages are additional volume goals split 1:2:3, with shared 60/120-second cooldowns after the first two stages. There is no proportional token release, percentage token bucket, stage refill, or price reset. One attack credits only its starting stage, including defined base-unit tail exceptions.
- A compatible local demo can use the owner-controlled Mock Token Oracle for dynamic Boss LP fees. It is labelled `TESTNET MOCK PRICE`, not live USD data. The supply fee remains 0.3%. Invalid/stale references or required fees above the configured maximum reject attacks, while claims and owner LP remain available. Dynamic fees and LP depth do not guarantee a market-price floor. External-oracle integration remains future work.
- Retain short-lived attack quote and transaction deadlines. Existing deployed bosses and the standalone BossHP demo keep their existing rules.
- Closing the form hides it without cancelling submitted transactions. Persist pending operations and confirmed launch results across navigation and reload.
- Success shows the confirmed boss identifiers and transaction link. The Hook-address battle feature merged from main is retained, including its optional success link. Integration changes only adapt that existing feature to zero deadlines and retain verified discovery of bosses from the previous Factory.
- The earlier compatible Factory deployment remains recorded on Base Sepolia. PR #72's build has no public deployment recorded here. Existing bosses keep their rules, and new launches are disabled when the configured Factory's pinned build differs from the bundled build. Any future deployment needs its own authorization and verification; do not relaunch or replace an existing boss.

## Implementation and acceptance

Reuse the existing Factory SDK, operation provider, launch logic, and Blacksmith presentation. Use zero as the explicit no-expiry deadline for Factory launches while preserving the launch tuple for pending-transaction recovery compatibility. Reject a nonzero deadline on new Factory launches. The shared Hook permits zero only for the volume-based Factory mode.

Use the shared real-v4 journey for the current implementation. It must cover continuous initial liquidity, one-stage attack credit, 60/120-second cooldown rejection and resumption, and prize claims after victory. Verify the perpetual lifecycle after a large time jump, refreshing the optional mock source when needed. Creator expiry/refund and initial-position recovery remain disabled. Separate owner-LP changes must preserve the initial position, credit, prize, and initial fees. The optional mock-fee path must use the same route and player bounds. Retain standalone expiry coverage.

For implementation changes, verify SDK deadline handling and launch recovery through the existing tests. Retain typecheck, production build, ABI consistency, and desktop browser checks for direct/game entry, redirect, form inputs, unavailable deployment, and live reads. The [testing rules](../agents/testing.md) govern focused checks; documentation-only updates require diff and reference checks rather than application tests.

## Authorization

Code, tests, documentation, and the new Factory deployment are authorized by the user's confirmation. The subsequent request authorizes committing, pushing a feature branch, and creating a pull request. Publishing a website and creating GitHub issues remain outside this request.
