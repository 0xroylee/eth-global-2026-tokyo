# Boss Pool delivery plan

Updated 26 September 2026. The no-burn direct-attack contracts, shared SDK, Next.js player app, and Phaser hub are implemented. Five focused Foundry cases pass. The fresh direct-attack local SDK journey passed with 14 successful transactions at commit `3450be7`. The earlier 18-transaction journey used enrollment-era contracts and is historical. Base Sepolia RPC access is verified, but there is no Boss Pool deployment there. Manual wallet-popup acceptance also remains open.

## Outcome and scope

Two fresh wallets approve MockUSD to the Router when needed, attack directly to buy ROY and BossHP, clear three stages, see two reserve-funded price resets, transfer eligible HP between wallets, and redeem HP for MockUSD. Attack and token-claim paths mint no NFT. Defeated-round attackers can separately claim an optional victory NFT. The Hook controls purchase counting and liquidity release.

The [requirements](requirements.md) own gameplay, [technical specification](technical-spec.md) owns contracts/interfaces/custody, [HP lifecycle](hp-lifecycle.md) owns clearing details, and [refill/reward math](refill-math.md) owns calculations. [CONTEXT.md](../CONTEXT.md) is the glossary.

Confirmed: one ROY attack currency, one ROY/BossHP battle pool, one MockUSD/ROY supply pool, no attack burn, stages 300/600/900, staged HP liquidity, rewards represented by BossHP, Base Sepolia, Next.js/TypeScript/Tailwind CSS, direct viem, Bun, and a small monorepo. Physical/magic, MROY, damage multipliers, dynamic fees and public BossHP sell-backs are outside the core.

Working claim default: eligible HP is transferable; claim atomically surrenders it into permanent custody and pays a fixed proportional reward, without burning. This is the model used by the current plan. A frozen-balance alternative was discussed but not selected. Do not silently combine the two.

## Ownership and repository

A owns contracts, backend/integration responsibilities, deployment, scripts and generated shared-chain exports. B owns UI, wallet interface, game presentation and browser rehearsal. GitHub handles remain unknown; issues stay unassigned until claimed.

Use the [Bun monorepo layout](technical-spec.md#monorepo-and-ownership):

- `contracts/`: Foundry, two core contracts, standard tokens/NFTs and the shared core scenario. A owns it.
- `packages/chain/`: generated ABI, public deployment manifest, viem actions/views and shared types. A owns contract-facing changes; B reviews consumption.
- `apps/web/`: Next.js App Router, Tailwind UI, direct viem wallet flows, and Phaser hub. B owns it; the migration from Vite is complete.
- `scripts/`: seed, deploy, focused E2E and smoke commands. A owns them.

One root Bun lockfile. Start with direct viem access; no backend service, database, queue, Turbo or Nx. Reuse the official v4 starter/helpers and OpenZeppelin before custom code. Keep AGENTS.md short and use the existing scoped guides; do not turn it into another product spec.

Implementation model routing remains exact: **gpt-6-sol high** for contracts, custody, settlement and cross-layer changes; **gpt-6-luna xhigh** for bounded UI/wiring/docs after interfaces are clear. This is routing for future implementation, not permission to spawn unnecessary agents.

## Frontend build sequence

The [frontend architecture](technical-spec.md#frontend-architecture) owns the selected stack and client boundaries. Keep this work within the existing BP slices:

1. **BP02/BP06:** complete. The Next.js app uses Tailwind and `@boss-pool/chain` for verified deployment reads. Local and Base Sepolia manifests are selected independently. Browser checks cover missing deployment and live local state.
2. **BP03:** implemented. The wallet UI handles injected-wallet connection, account and chain changes, direct attack approval, and receipts. Manual wallet-popup acceptance remains open.
3. **BP04:** implemented. The Router quote works before approval. The SDK simulates authenticated attacks after approval and handles stale quotes, typed receipt results, and recovery.
4. **BP05/BP06:** implemented. The Phaser hub and boss scenes use confirmed round state, keyboard input, and reduced-motion handling.
5. **BP07/BP10/BP11:** SDK reward and NFT operations are implemented. The local journey passed. Base Sepolia deployment and gameplay remain open; historical Robinhood receipts do not close that gate.

BP01's Vite build evidence is historical. Current Next.js checks are listed in the [SDK verification record](sdk-verification.md).

## Candidate demo configuration

| Parameter | Planning value | Gate before deployment |
| --- | --- | --- |
| Stage HP | 300 / 600 / 900 | Actual output and bounded dust in BP01 |
| Prize | 1,000 MockUSD, 6 decimals | Separate fully funded prize ledger |
| Entry | None | Fresh wallets can attack directly after Router approval |
| BossHP supply | 2,000, 18 decimals | Prove integer reserve sufficiency for permitted attacks |
| Battle fee | Fixed 0.30%, modeled protocol fee zero | Verify actual supported fees; reject unsupported configurations |
| Battle price | 1 to about 1.211659 ROY/HP each stage | Same-range plan, correct currency ordering and reset limits |
| Supply LP example | 50,000 ROY + 5,000 MockUSD | Full-range estimate must become actual v4 position amounts |
| ROY supply candidate | 100,000 total supply, about 50,000 for the supply LP; remaining ROY stays locked in Router custody | Reconcile actual LP debits and reserves; no starter grant is issued |
| Round deadline | Two hours after activation as a demo default | Fixed before activation; independent of event submission time |

The calculated battle budget is about 1,987.318762 ROY and 1,802.708124 HP of total reserve spending. About 1,800 HP ends in player circulation and 2.708124 in LP fees. First refill restores 300 HP then adds 300; second restores 600 then adds 300. Final stage performs no reset.

The earlier 217.58-MockUSD solo attack-plus-entry estimate included an entry fee that no longer exists. Recalculate attack costs from the fresh direct-attack journey. The model does not establish fair participation, market stability, or Sybil resistance.

## Work breakdown

Keep the existing epic and 14 child issue identifiers. Rewrite their scopes rather than creating duplicate tickets. Each core slice includes its real client behavior and shared verification. [Epic](https://github.com/0xroylee/eth-global-2026-tokyo/issues/1) · [Demo milestone](https://github.com/0xroylee/eth-global-2026-tokyo/milestone/1).

| Issue | Verifiable slice | Priority | Blocked by | Lead | Planning effort |
| --- | --- | --- | --- | --- | --- |
| [BP01](https://github.com/0xroylee/eth-global-2026-tokyo/issues/2) | Prove the no-burn BossHP lifecycle and bootstrap the monorepo | P0 | None | A + B | 4–6 h |
| [BP02](https://github.com/0xroylee/eth-global-2026-tokyo/issues/3) | Fund and display a round with protected HP reserves and prize | P0 | [BP01](https://github.com/0xroylee/eth-global-2026-tokyo/issues/2) | A + B | 4–6 h |
| [BP03](https://github.com/0xroylee/eth-global-2026-tokyo/issues/4) | Attack directly from a fresh wallet; no entry NFT or starter ROY | P0 | [BP02](https://github.com/0xroylee/eth-global-2026-tokyo/issues/3) | A + B | 2–3 h |
| [BP04](https://github.com/0xroylee/eth-global-2026-tokyo/issues/5) | Attack through MockUSD to ROY to BossHP without burning | P0 | [BP03](https://github.com/0xroylee/eth-global-2026-tokyo/issues/4) | A + B | 4–6 h |
| [BP05](https://github.com/0xroylee/eth-global-2026-tokyo/issues/6) | Clear stages and atomically refill the same BossHP pool | P0 | [BP04](https://github.com/0xroylee/eth-global-2026-tokyo/issues/5) | A + B | 4–7 h |
| [BP06](https://github.com/0xroylee/eth-global-2026-tokyo/issues/7) | Present three confirmed boss forms and recover arena state | P0 | [BP05](https://github.com/0xroylee/eth-global-2026-tokyo/issues/6) | B + A | 3–5 h |
| [BP07](https://github.com/0xroylee/eth-global-2026-tokyo/issues/8) | Redeem BossHP for MockUSD and claim a victory NFT | P0 | [BP05](https://github.com/0xroylee/eth-global-2026-tokyo/issues/6) | A + B | 4–7 h |
| [BP08](https://github.com/0xroylee/eth-global-2026-tokyo/issues/9) | Use held ROY to buy BossHP as an optional attack route | P1 | [BP04](https://github.com/0xroylee/eth-global-2026-tokyo/issues/5) | A + B | 1–2 h |
| [BP09](https://github.com/0xroylee/eth-global-2026-tokyo/issues/10) | Replay shared attacks and distinguish damage from reward holdings | P1 | [BP04](https://github.com/0xroylee/eth-global-2026-tokyo/issues/5) | A + B | 2–3 h |
| [BP10](https://github.com/0xroylee/eth-global-2026-tokyo/issues/11) | Expire unfinished rounds and preserve outstanding reward custody | P0 | [BP02](https://github.com/0xroylee/eth-global-2026-tokyo/issues/3), [BP07](https://github.com/0xroylee/eth-global-2026-tokyo/issues/8) | A + B | 2–3 h |
| [BP11](https://github.com/0xroylee/eth-global-2026-tokyo/issues/12) | Deploy and rehearse the real two-wallet Base Sepolia journey (original issue targets Robinhood) | P0 | [BP06](https://github.com/0xroylee/eth-global-2026-tokyo/issues/7), [BP07](https://github.com/0xroylee/eth-global-2026-tokyo/issues/8), [BP10](https://github.com/0xroylee/eth-global-2026-tokyo/issues/11) | A + B | 2–4 h |
| [BP12](https://github.com/0xroylee/eth-global-2026-tokyo/issues/13) | Publish current judge evidence and complete Uniswap feedback | P0 | [BP11](https://github.com/0xroylee/eth-global-2026-tokyo/issues/12) | A + B | 1–2 h |
| [BP13](https://github.com/0xroylee/eth-global-2026-tokyo/issues/14) | Evaluate emissions or vesting for a future round only | P2 | [BP11](https://github.com/0xroylee/eth-global-2026-tokyo/issues/12) | A + B | 2–4 h |
| [BP14](https://github.com/0xroylee/eth-global-2026-tokyo/issues/15) | Define a World ID eligibility policy before integrating it | P2 | [BP11](https://github.com/0xroylee/eth-global-2026-tokyo/issues/12) | A + B | 3–5 h |

Ten P0 slices total **30–49 person-hours** as an initial planning range. This is not elapsed time, excludes unresolved provider/deployment delays, and must be revised after BP01. Contract dependencies mean two people cannot simply halve that number. The earlier 09:00 coding / 10:00 live checkpoint lacks a confirmed timezone and date relevance; do not treat it as a delivery commitment.

BP08 and BP09 are optional. BP13 and BP14 require future product decisions. The core still includes wallet HP balance, current stage, reward preview and refresh recovery when the global activity screen is cut.

## Dependency graph

```mermaid
flowchart TD
    A["BP01: local core proof and workspace"] --> B["BP02: funded round and custody"]
    B --> C["BP03: direct attack"]
    C --> D["BP04: two-hop attack"]
    D --> E["BP05: stage refill and release"]
    E --> F["BP06: confirmed arena"]
    E --> G["BP07: HP redemption and NFT"]
    B --> H["BP10: expiry and recovery"]
    G --> H
    F --> I["BP11: Base Sepolia E2E and rehearsal"]
    G --> I
    H --> I
    I --> J["BP12: public evidence and submission"]
    D -. optional .-> K["BP08: held ROY"]
    D -. optional .-> L["BP09: activity"]
```

## Two-person execution sequence

| Checkpoint | A: contracts and integration | B: UI and gaming | Evidence to proceed |
| --- | --- | --- | --- |
| Start immediately | BP01: reuse core fixture, pin dependencies, establish workspace and chain probe | BP06 preparation: original three forms, arena states, wallet shell; agree shared types | Reproducible local core trace and shared shape draft |
| Fund and attack | BP02/BP03: prize/pool custody, generated ABI, fresh-wallet Router flow | Connect round views, MockUSD balance/approval, and receipt states | Both fresh wallets attack against local contracts |
| First hit | BP04: real two-hop attack and ordinary HP delivery | Quote, signature, pending/failure/success feedback | Partial real attack, balances and stageSold agree |
| Progression | BP05: same-pool refill, next LP, defeat, atomic failure | BP06: confirmed transitions, refresh and reduced motion | All three stages and two resets pass the shared scenario |
| Rewards and terminal paths | BP07/BP10: transferable redemption, NFT, expiry, post-deadline custody | Claim approvals/results and expired/defeated screens | HP cannot be reused; prize and reserve balances reconcile |
| Release | BP11: verify Base Sepolia access and provenance, deploy, then run the same route | Testnet browser rehearsal and recording | Base Sepolia receipts, source commit, usable UI |
| Submit | Supply verified source/transaction links and implementation observations | BP12: pitch, public README, recording and feedback form | Public evidence plus form confirmation |

B's fixture work can start before its integration dependencies finish. It does not close an issue until the real route works. A publishes interface updates in the same change as contract changes; B does not maintain handwritten duplicate ABIs.

## Interface handoff

BP01 drafts these shapes; the compiled ABI becomes authoritative when contracts exist.

- Attack request: input cap, minimum ROY output, minimum HP output, expected stage and deadline. Player identity comes from the router caller.
- Round view: status, current stage, nominal stage capacity, remaining sellable HP, stageSold values, prize, deadline and frozen eligible supply after victory.
- Player view: attack history, token balances/allowances, victory-NFT claim flag and redeemable-HP reward preview.
- Events: AttackExecuted with both hop amounts; StageCleared; StageActivated after successful refill/LP addition; BossDefeated with finalEligibleHP; HP redemption; expiry/refund.
- Currency values: bigint in TypeScript and base units on-chain; decimal strings in serialized fixtures. Pool keys and addresses come only from verified manifests.
- Transaction states: disconnected, wrong chain, approval needed, simulation failure, signature pending, submitted, confirmed, reverted, replaced, and stale-stage requote. The frontend's transition animation is not authoritative state.

The current hook permission set is beforeInitialize, beforeSwap, afterSwap, beforeAddLiquidity and beforeRemoveLiquidity. Callback flags must match the mined address. The Boss pool alone uses the game hook. A controller refill is a maintenance operation and cannot increase stageSold or eligible supply.

## Shared verification and completion rules

Use **one reusable two-wallet core/E2E scenario**, extended as issues land:

1. Fund the prize, both pools and future reserves. Give both fresh wallets enough MockUSD to attack.
2. Perform a partial two-hop attack and verify delivered BossHP with unchanged total supply.
3. Finish each stage with a bounded final hit, verify no next-stage spill, two price resets, LP increments and reserve/player separation.
4. Freeze actual eligible HP at defeat. Transfer a portion from one wallet to the other, redeem eligible HP into permanent custody, and claim separate victory NFTs.
5. Assert total paid never exceeds originalPrize, redeemed HP never recirculates, and unissued/fee HP remains in controlled custody beyond the deadline while rights remain.

Reuse that fixture for a failed-transition rollback, the reproduced final-base-unit boundary, an unfinished-round expiry, and a concrete authentication/custody rejection if the journey cannot cover it. These are risk checks, not a requirement for a test per function. No broad fuzz matrix, snapshots, coverage target or custom simulator.

A slice closes only when its acceptance works through the real relevant contracts and client, with a tested commit and focused evidence. Passing older burn-based prototypes does not satisfy no-burn/token-redemption acceptance. Do not rerun unrelated tests after documentation-only changes.

BP01 is the local feasibility gate. Chain readiness is reported there but remains a separate **BP11 release gate**. Local development may continue; release cannot be called Base Sepolia-tested without target-chain receipts. Existing Robinhood receipts are historical and do not close this gate.

## Evidence and unresolved gates

| Status | Fact or assumption | Owner / next resolution |
| --- | --- | --- |
| Verified historical | A pinned real-v4 burn-based same-pool refill scenario passed one local test; integer dust and settlement were recorded | Superseded for current local behavior by [BP01 evidence](bp01-foundation.md) |
| Verified arithmetic | Finite-range clearing, refill costs and fixed-denominator redemption calculations reconcile | A verifies real no-burn delivery/redemption in BP01 and BP07 |
| Verified RPC access | Base Sepolia chain `84532` responds through the configured viem client. No Boss Pool deployment is verified there. | A deploys and verifies the team fixture in BP11 |
| Verified local | BP01 records no-burn contracts and the shared real-v4 scenario. The current SDK and player app have separate fresh checks. | See [BP01 evidence](bp01-foundation.md) and the [SDK verification record](sdk-verification.md) |
| Unverified | Base Sepolia deployment and player journey, manual browser-wallet popup acceptance, and production contract audit | Keep the BP11 target-chain and user wallet checks open |
| Working default | Transferable HP surrendered without burn; fixed fees; candidate funding amounts | Revisit only on a user decision or contrary execution evidence |
| Not supplied | Teammate handles, checkpoint timezone and a verified submission deadline | Leave issues unassigned; use relative checkpoints |

## Cut order and demo

Cut held-ROY convenience, global activity, dynamic fees, World ID, emissions/vesting, elaborate sound and extra animation first. Keep no-burn HP delivery, protected reward rights, stage gates, two-hop execution, optional victory NFTs, and honest target-chain evidence.

Use prepared wallets and approvals. A 60–90 second demo can show a direct partial attack, stages 1 → 2 → 3, defeat, current HP reward rights, redemption and the optional victory NFT. Accelerate presentation or use a disclosed prepared stage; do not fake contract effects or introduce an admin HP setter. Keep an uncut two-wallet recording as supporting evidence.

The submission owner must verify the current sponsor page and complete both FEEDBACK.md and the required feedback form. The standard UF track totals $6,000; it is not a guaranteed award. Continuity eligibility is separate.
