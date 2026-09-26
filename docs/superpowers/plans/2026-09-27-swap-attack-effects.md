# Swap Attack Effects Implementation Plan

> For Grok 4.7: execute this plan task by task. Read the repository instructions first. If available, use the executing-plans skill. Do not start parallel agents or switch models without authorization.

**Goal:** Give Swap Attack a satisfying pixel-art Token Slash sequence, synchronized to actual wallet and receipt states.

**Architecture:** Extend the existing React battle presentation and receipt decoder. Keep authoritative chain state separate from temporary visual state. Reuse the existing Web Audio approach and native CSS; do not introduce another game engine, transaction controller, or animation dependency.

**Tech stack:** Next.js, React, TypeScript, CSS transform/opacity animations, Web Audio, existing @boss-pool/chain SDK.

## Baseline and scope

Reviewed working files at HEAD d620713. Reinspect current files and preserve concurrent changes before implementation. The current battle is Factory-aware: older slide documents saying Factory player UI is missing are not an implementation reference.

Read AGENTS.md, apps/web/AGENTS.md, docs/agents/implementation.md, docs/agents/testing.md, docs/agents/models.md, CONTEXT.md and the relevant Factory accounting section of docs/boss-factory.md. Read installed Next.js guidance for APIs you actually change.

In scope: battle-page effects, quiet optional SFX, confirmed feedback and focused verification. Out of scope: contract changes, token economics, wallet redesign, new battles, map effects, touch controls, background music changes, dependencies, public-chain broadcasts, deployment or pushing code.

## Existing integration points

- apps/web/src/components/battle/BattleView.tsx: owns effect state, identity, receipt deduplication, player portrait, boss container and transaction dialogs.
- apps/web/src/lib/battle.ts: confirmedBattleAttack validates network, deployment, account, router, hook and AttackRecorded. Reuse its event ID, actual bossHPOut, original stage, stageCleared and defeated fields.
- apps/web/src/lib/battle.test.ts: extend existing receipt fixtures and guards.
- apps/web/src/components/battle/BossStage.tsx: already implements idle, hit, transition and defeat presentation. Extend it, do not layer competing recoil controllers onto it.
- apps/web/src/components/battle/StatusPanel.tsx and DialogWindow.tsx: retain mode-aware values and confirmed status.
- apps/web/src/lib/useBossPool.ts and components/BossActions.tsx: inspect write-state/action discrimination and existing transaction recovery. Avoid changing their transaction behavior.
- apps/web/src/components/HubSoundControl.tsx: reuse its AudioContext gesture gating, quiet envelopes, voice cap, visibility and teardown patterns. Its audio engine is currently component-local; do not import a second hub control into battle or refactor the whole sound system.
- apps/web/src/app/globals.css: existing pixel theme and battle keyframes.

New files only where needed: components/battle/AttackEffects.tsx for the noninteractive overlay; components/battle/useBattleSound.ts for the small battle audio lifecycle. Keep sequence logic in BattleView unless its size warrants one focused hook beside it.

## Presentation contract

| Actual state | Visual | Audio |
| --- | --- | --- |
| Quote or approval | Existing normal UI; no attack animation | No attack SFX |
| Matching attack awaiting signature | Player portrait leans into a casting pose, gold spark pulses | One quiet charge cue |
| Matching attack submitted | Small hovering/spinning token, “Attack pending…” | One submission cue, no loop |
| Unresolved receipt | Low-key pending indication, “Checking transaction…” | Silent |
| Valid confirmed attack | Token projectile, diagonal pixel slash, boss recoil and actual result | Whoosh then impact |
| Wallet rejection or confirmed failure | Charge fades out, existing specific error remains visible | No impact or victory sound |
| Other wallet/network/boss transaction | Existing transaction message only | Silent |

Do not infer attack intent from busy alone or button clicks: the same control may connect, switch network or request approval. Use the actual write request/action kind. If current prompting state lacks a typed distinction, make the smallest explicit presentation metadata addition at the action source; never match human-readable strings.

## Timing and art direction

Normal confirmed sequence lasts 750 ms: token launch 0–240 ms; impact/slash 240–360 ms; recoil and 4–8 square sparks 300–500 ms; settle/fade to 750 ms. Hold an actual-result label for roughly 1.2 seconds without blocking actions.

Use gold/cream for the token and slash, cyan for a stage-clear wave, existing navy outlines, hard pixel edges and image-rendering: pixelated. Reuse suitable local assets first. A simple token/slash can use small CSS pixel primitives; do not fake a detailed character attack sprite or add a large asset-generation dependency. Anchor launch to the existing player portrait and impact to the visible boss, not fixed viewport coordinates. Overlay is pointer-events:none and aria-hidden, beneath wallet/dialog controls. Cap particle count at eight.

Stage clear: normal hit followed by one cyan ring and old-form fade; reveal confirmed next form at about 1.5 seconds. Final victory: normal hit then a 1.8-second defeat fade/particles, then the existing victory UI. Never hide the result indefinitely waiting for animationend. No random critical hits, random damage, rapid strobing or full-window shake. Recoil maximum 4 px; no camera shake needed for v1.

## Task 1: Receipt-safe sequence lifecycle

- [ ] Extend existing battle tests with the shared fixture: a valid receipt produces one hit with exact original-stage output; approvals and mismatched account/network/hook/router produce none; stage-clear and defeat flags come from that receipt's events.
- [ ] Run `bun test apps/web/src/lib/battle.test.ts` and establish failures for changed behavior before implementing it.
- [ ] Retain confirmedBattleAttack as the authority. Use its stable ID for effect deduplication. Never key replay to polling timestamps or object references.
- [ ] Separate pending presentation from confirmed sequence. Define phase as `idle | charging | pending | projectile | impact | stage-clear | victory`; failure returns to idle while existing error UI remains.
- [ ] Deduplicate using a bounded browser-session set of at most 100 confirmed IDs, only after identity validation. Persist IDs before starting playback so route remounts and recovered receipts cannot replay an already-seen success. Catch storage errors and fall back to an in-memory set. Do not modify transaction recovery storage.
- [ ] On identity change/unmount: cancel timers/RAF, clear particles and sounds, and drop old effect. Include account, chain, hook and deployment identity. A hidden tab should mark an arriving valid result seen and show updated state on return without replaying stale effects.
- [ ] Make timer ownership StrictMode-safe: cleanup cannot permanently consume a receipt without leaving its valid UI state visible. Use stable receipt ID dependencies and test double setup/cleanup behavior.

## Task 2: Token Slash and confirmed progression

- [ ] Add AttackEffects overlay with an explicit interface such as `{phase, effectId, origin, target, reducedMotion}`. Points are coordinates relative to the battle container. Read refs after layout; refresh bounds on resize with cleanup. Do not query arbitrary global selectors.
- [ ] Implement the timing above with one cancellable sequence owner. Animate only transform and opacity. For white flash, fade a positioned white sprite/silhouette layer rather than animating filters. Avoid duplicate recoil from BossStage and the overlay.
- [ ] Keep receipt.stage as the impact target even if the refreshed round already reports the next form. Switch to current confirmed form after the transition. Never fabricate intermediate chain state.
- [ ] Keep balances, quotes, deadlines and actionable controls tied to latest authoritative reads. Visual stage may lag briefly; transactions must never use visual-stage state.
- [ ] Factory mode: show `+X <token symbol> received`; label volume-based UI “Raid Progress” where appropriate. Use decoded VolumeCredited or existing confirmed round values for volume. Do not present MEME output as MockUSD volume. Standalone mode: actual BossHP output can be shown as damage.
- [ ] Animate bar scaleX only toward confirmed values; no optimistic decrement. Do not duplicate progress-bar animation if already present. Other players' confirmed progress can update bars, but must not trigger this wallet's projectile.
- [ ] On final confirmation show “Victory — prize claim available” only where claim eligibility is confirmed. Never show prize paid until an actual claim succeeds.
- [ ] Respect prefers-reduced-motion, including changes during a sequence: no flight, spin, recoil, wave or floating numbers; brief opacity feedback and static result only. Keep result text available longer than the existing 100 ms reduced-motion effect timeout. Use a single polite live-region summary, not one announcement per frame.

## Task 3: Optional quiet battle sound

- [ ] Add a visible keyboard-accessible Sound on/off control. Start disabled unless the application already has an explicit shared preference. Never treat wallet connection or an attack click alone as consent to enable sound.
- [ ] Use one battle AudioContext, created/resumed only through the sound control gesture. Implement short oscillator/noise envelopes with total gain at or below the hub's 0.045 reference level and at most eight voices. Stop and disconnect nodes after playback.
- [ ] Add charge, launch, impact, stage-clear and victory cues. Pending/unresolved has no repeated sound. SFX errors must not affect wallet actions or UI rendering.
- [ ] Mute immediately, stop on document.hidden, identity changes and unmount, and cancel scheduled voices. Re-enabling sound does not replay old transactions. Do not alter music preferences.

## Task 4: Verify and hand off

- [ ] Run `bun test apps/web/src/lib/battle.test.ts`, `bun run typecheck`, and `bun run web:build`. If adding pure lifecycle checks, run their exact file too. Do not run the full contract suite for presentation-only changes.
- [ ] Desktop browser checks at 1280×720 and 1440×900: approval has no projectile; rejected signature fades; pending/unresolved has no damage; successful receipt hits once; stage transition targets the old form; defeat reveals victory UI; mute/reduced motion work; resize keeps anchors aligned.
- [ ] Check account/network/boss changes and exiting during a pending transaction. Verify polling, recovery and remount do not replay impact/audio, and pending transactions remain recoverable through existing controls.
- [ ] Reuse the existing local-chain journey for real receipt verification if available. Test failure/motion cases with existing fixtures or clearly isolated test tooling, never introduce fake live damage or broadcast a public transaction. If no local environment exists, disclose what was not verified.
- [ ] Deliver a short desktop recording of normal hit, stage clear and reduced motion, plus changed files and exact check results. Keep fixture recordings explicitly labeled. Do not claim an untested browser-wallet flow passed.

## Acceptance gate

Grok is done when the attack feels responsive during waiting, the successful hit occurs only once after a validated receipt, its values match the selected encounter, no approval or failure appears as a hit, and presentation/audio cleanup survives navigation and identity changes. Preserve the existing wallet, quote, claim and recovery behavior.
