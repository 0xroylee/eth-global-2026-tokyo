# BoostPad live launch

Approved in the 26 September 2026 grilling session. The user confirmed implementation after resolving the decisions below.

## Behavior

- `/boostpad` uses the existing Blacksmith scene and cream/navy pixel form. Direct visits open the form immediately. `?from=game` retains walking and the E interaction. `/launch` redirects to `/boostpad`.
- Creators enter an existing ERC-20 address, total allocation, MockUSD volume target, and prize percentage. Reuse token metadata/balance reads, funding quotes, exact approvals, launch, and receipt recovery.
- Every new Factory boss has three stages with the existing default cat portraits. Remove stage-count and image selectors.
- A Factory boss stays active until defeated. It has no expiry, cancellation, or creator withdrawal, including after defeat. LP assets, unused reserves, and prize funds cannot be recovered by the creator. Normal stage refills remain allowed. Earned player prizes remain claimable indefinitely.
- Retain short-lived attack quote and transaction deadlines. Existing deployed bosses and the standalone BossHP demo keep their existing rules.
- Closing the form hides it without cancelling submitted transactions. Persist pending operations and confirmed launch results across navigation and reload.
- Success shows the confirmed boss identifiers and transaction link. Factory battle-page integration is outside this change.
- Deploy a new compatible Factory on Base Sepolia and update its manifest only after verification. Do not relaunch or replace an existing boss.

## Implementation and acceptance

Reuse the existing Factory SDK, operation provider, launch logic, and Blacksmith presentation. Use zero as the explicit no-expiry deadline for Factory launches while preserving the launch tuple for pending-transaction recovery compatibility. Reject a nonzero deadline on new Factory launches. The shared Hook permits zero only for the volume-based Factory mode.

Extend the real-v4 core journey to prove attacks and claims work after a large time jump, all three stages still clear, and creator expiry/refund/LP recovery fail before and after defeat. Retain standalone expiry coverage. Verify SDK deadline handling and launch recovery through the existing tests. Run typecheck, production build, ABI consistency, and desktop browser checks for direct/game entry, redirect, form inputs, unavailable deployment, and available live reads.

## Authorization

Code, tests, documentation, and the new Factory deployment are authorized by the user's confirmation. The subsequent request authorizes committing, pushing a feature branch, and creating a pull request. Publishing a website and creating GitHub issues remain outside this request.
