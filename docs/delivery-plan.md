# Boss Pool delivery plan

Status: implementation work is not started. Estimates are person-hours. GitHub issues are the team's execution checklist.

## Delivery strategy

First prove a real v4 swap and output-burn settlement on the selected chain. Then deliver a physical attack before generalizing it to magic. Keep one complete user-visible journey per issue, with contract state, client behavior, and verification together.

One teammate owns contracts + backend. The other owns UI + interface + gaming. The frontend teammate can build against the specified state/events while contract work proceeds. Mock-backed UI is preparation; a P0 feature closes only after its real integration works.

## Work breakdown

GitHub issue links are added after publication.

| Key | Slice | Priority | Depends on | Lead | Estimate | Stories |
| --- | --- | --- | --- | --- | --- | --- |
| BP01 | Connect to Robinhood testnet and prove both v4 pools | P0 | None | A | 2–4 h | US01 |
| BP02 | Fund and display the three-stage boss round | P0 | BP01 | A + B | 2–3 h | US02 |
| BP03 | Enroll with Little Roy NFT and starter physical ammo | P0 | BP02 | A + B | 2–3 h | US03 |
| BP04 | Execute physical auto-buy-and-burn attacks | P0 | BP03 | A + B | 3–5 h | US04 |
| BP05 | Execute magic attacks with weighted contribution | P0 | BP04 | A + B | 2–3 h | US05 |
| BP06 | Present three stages and share dynamic fees across pools | P0 | BP05 | B + A | 2–3 h | US06 |
| BP07 | Claim proportional MockUSD and a victory NFT | P0 | BP06 | A + B | 2–3 h | US07 |
| BP08 | Spend starter and leftover ammo through a separate held-burn action | P1 | BP05 | A + B | 1–2 h | US08 |
| BP09 | Reconstruct shared activity and leaderboard | P1 | BP05 | A + B | 2–3 h | US09 |
| BP10 | Expire an unfinished round and refund its unawarded prize | P0 | BP02, BP04 | A + B | 1–2 h | US10 |
| BP11 | Verify and rehearse the complete two-wallet testnet demo | P0 | BP07, BP10 | B + A | 2–3 h | US01–US07, US10 |
| BP12 | Publish judge evidence and complete UF submission materials | P0 | BP11 | B + A | 1–2 h | US11 |
| BP13 | Evaluate bounded phase-triggered ammo releases | P2 backlog | BP11 + approved emission policy | A | 2–4 h after decision | Optional |
| BP14 | Add World ID at an agreed eligibility step | P2 backlog | BP11 + approved identity policy | A + B | 3–5 h after decision | Optional |

A = contracts + backend. B = UI + interface + gaming. Handles were not supplied, so issues stay unassigned.

BP08 and BP09 are optional. The core app still shows current-wallet balances, damage, claimable reward, and current stage with refresh recovery. Cutting the global leaderboard or inventory-burn button must not remove those core reads.

```mermaid
flowchart LR
    A[BP01 Chain and two pools] --> B[BP02 Fund round]
    B --> C[BP03 Entry]
    C --> D[BP04 Physical attack]
    D --> E[BP05 Magic attack]
    E --> F[BP06 Stages and shared fees]
    F --> G[BP07 Claims]
    E -.-> H[BP08 Held ammo, optional]
    E -.-> I[BP09 Activity, optional]
    B --> J[BP10 Expiry]
    D --> J
    G --> K[BP11 Demo]
    J --> K
    K --> L[BP12 Submission]
    K -.-> M[BP13 Emissions, backlog]
    K -.-> N[BP14 World ID, backlog]
```

## Parallel work for two teammates

| Phase | Teammate A: contracts + backend | Teammate B: UI + interface + gaming | Handoff |
| --- | --- | --- | --- |
| Start | RPC, real v4 proof, manifest, token types | Arena layout, physical/magic controls, original three-form assets | Shared view/event types and sample payloads |
| Entry | Funding, reserves, entry, token/NFT permissions | Connect, allowance, enrollment, balances, error states | Entry ABI and successful receipt |
| Combat | Physical settlement and stage accounting, then magic | Attack quote, approval/signature/receipt UX, hit effects | Actual outputs and event ordering |
| Progress | Shared stage fees, expiry, claims | Full new HP bar per stage, victory and expired states | State snapshots and error decoding |
| Release | Testnet seed, accounting tests, attack/claim evidence | End-to-end browser test, recording, narration, feedback package | Frozen commit and reproducible demo |

B can start original assets and fixture UI immediately. A owns the shared ABI and deployment manifest, with B reviewing compatibility. Avoid competing contract edits during the settlement work. Each feature issue names the piece both teammates must integrate.

## Schedule and feasibility

The requested checkpoint is **26 September 2026, 09:00 coding / 10:00 live**. Timezone is unconfirmed. Japan is one hour ahead of Hong Kong. This is a requested demo checkpoint, not a verified event submission deadline.

P0 estimates total **19–31 person-hours**. With two people, some UI work overlaps, but much of the contract path is sequential. A complete build from this empty repository in the 09:00–10:00 hour is not credible. Use that hour for integration and rehearsal after work tonight.

| Checkpoint | Work | Exit condition |
| --- | --- | --- |
| Tonight, first 30 min | Claim work, freeze ABI/event shapes, fixture values, and two-role ownership | Both teammates share the same contract |
| Tonight, first 90 min | A timeboxes RPC and real v4 burn proof; B builds arena states and original assets | Local settlement proof works; testnet readiness has evidence or an explicit blocker |
| Tonight, next block | Fund, entry, physical attack, then magic and stage fees | Local two-wallet path works with real contracts |
| Tonight, final block | Claims, expiry, testnet deploy/seed, UI wiring | Both attack receipts and deployed addresses exist |
| Tomorrow, 09:00–09:30, timezone pending | Fix integration failures and execute the full journey | Core demo succeeds |
| Tomorrow, 09:30–10:00, timezone pending | Freeze, record fallback, rehearse, prepare evidence | Two clean runs or a specific unresolved blocker |

If testnet readiness fails after 90 minutes, continue locally while A obtains a working provider or sponsor guidance. Keep BP01's remote acceptance open. Do not silently change chains.

Cut held-ammo convenience, global activity, emissions, World ID, rich sound, and extra animation first. Keep two real auto-buy attack types, weighted burn accounting, independent stage HP, shared stage fees, and token/NFT claims. A fixed-fee emergency build must say dynamic fees remain incomplete.

## Issue workflow

Use the parent epic and child issues below. Each issue includes owner roles, dependencies, acceptance criteria, test evidence, and exclusions. Priority labels distinguish core, optional, and backlog work.

`status:ready` means no unresolved prerequisite. `status:blocked` means final integration depends on another issue; fixture UI and tests can still be prepared. `status:backlog` means do not implement until its explicit product policy is approved.

Teammates claim by assigning themselves or commenting with owner and branch. GitHub handles are not guessed. Use `codex/` for branches created by Codex. Link PRs to the issue, and update dependent triage when prerequisite changes land.

Done means the observable user journey works and the PR includes the tested commit plus relevant tests, screenshot, or transaction evidence. A merged contract with an unwired UI does not close a feature slice. A closed issue is evidence only if its acceptance actually passed.

## Sixty-second presentation

This is a story timing target, not a promise that all wallet prompts and receipts complete in sixty seconds.

| Time | Visible action | Evidence |
| --- | --- | --- |
| 0–10 s | Show funded boss, testnet label, NFT entry, and two attacks | Escrow and entry reads or an identified recorded transaction |
| 10–25 s | Execute a physical auto-buy-and-burn | Swap/burn receipt, HP, contribution, leftover balance |
| 25–40 s | Use magic and show all three stages | Multiplier 3, independent HP resets, confirmed stage events |
| 40–50 s | Final hit and contribution split | Final defeat and frozen weighted denominator |
| 50–60 s | Show token claim and victory NFT | Real wallet balances and receipts |

Stage budgets allow a fixture script to target roughly three hits per stage: 100 physical damage per hit in stage 1, 200 in stage 2, and 100 MROY for 300 damage in stage 3. AMM output changes, so derive input quotes and cap burns at runtime. Do not hardcode a constant token price into the attack.

Prepare wallets and approvals in advance. Keep an uncut two-wallet recording. A shortened live sequence may start from a prepared stage, but disclose earlier actions. Deploy a fresh arena for reset; do not add an admin HP override. No fake burn or fake claim is acceptable as protocol evidence.

## Submission evidence

Collect public code, a deliberate source-license choice, commit-pinned contract line links, deployment manifest, attack receipts from both pools, claim receipts, test commands/results, a playable URL or reproducible run instructions, recorded fallback, completed FEEDBACK.md, and feedback-form confirmation.

Continuity eligibility remains unverified. The $6,000 figure is the standard-track total, not first prize. Sources and deployment limitations are in [source notes](sources.md).
