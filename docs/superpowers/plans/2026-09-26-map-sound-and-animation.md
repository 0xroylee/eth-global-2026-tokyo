# Map Sound and Animation Implementation Plan

> Handoff to Grok 4.7. Execute tasks sequentially, reviewing the existing draft before modifying it. Use the executing-plans workflow if available. The user has authorized implementation; no additional design approval is needed.

**Goal:** Make exploration of the current RPG hub feel alive through restrained ambient animation and responsive, optional sound.

**Architecture:** Reuse Phaser for world-space effects and Web Audio for short synthesized cues. React owns the sound toggle; existing GameBridge gate events trigger sound. Preserve the existing water/torch tile animation and reduced-motion handling.

**Stack:** Existing Next.js/React/TypeScript, Phaser 4.2.1, native Web Audio. No new dependencies or external audio assets.

## Starting point and scope

The current branch is `feat/base-sepolia-wallet`. Four files contain an **uncommitted, partially verified draft**:

- `apps/web/src/components/HubSoundControl.tsx`: sound toggle, enable confirmation, gate discovery/open tones, cleanup.
- `apps/web/src/components/GameShell.tsx`: mounts the sound toggle at the map's top right.
- `apps/web/src/game/HubAtmosphere.ts`: 24 drifting fireflies and halos at torch/lantern tiles.
- `apps/web/src/game/HubScene.ts`: constructs and updates atmosphere.

These changes already exist in the user's working directory; they are not included in a commit or available in a fresh checkout. Preserve and finish them. If working elsewhere, obtain those four files or recreate the explicitly described draft. Do not assume they have passed browser acceptance.

Read `AGENTS.md`, `apps/web/AGENTS.md`, `docs/agents/implementation.md`, `docs/agents/testing.md`, and `docs/agents/models.md`. Read the installed Next.js client-component guide before changing React code.

Keep this pass to the map page. Preserve wallet behavior, gate IDs, collision, movement speed, map layout, chain reads, and fixture labels. No background music, camera shake, new art pack, or gameplay changes. Only animate transforms and opacity for the added effects. No automatic wallet prompts or transactions during verification.

## Task 1: Review the current draft and establish a baseline

- [ ] Run `git status --short --branch` and read the four files above plus `apps/web/src/game/bridge.ts`, `hubTiles.ts`, and `components/GameCanvas.tsx`.
- [ ] Check how `GameShell` calls `bridge.clear()` during effect cleanup. Confirm Strict Mode remounts and new audio subscriptions cannot leave the sound control unsubscribed. Prefer each owner removing its own subscriptions; avoid a parent clearing other components' subscriptions during Strict Mode cleanup.
- [ ] Inspect scene shutdown and restart: atmosphere references, gate arrays, and event handlers must not accumulate across a scene restart.
- [ ] Run the focused frontend check: `bunx tsc --noEmit -p apps/web/tsconfig.json`.
- [ ] Run `bun run typecheck` and `bun run web:build`, recording actual failures separately from changes introduced by this work.

Known baseline limitations from the previous attempt: frontend type checking passed; root type checking failed in `scripts/exercise-boss-pool.ts:172` because viem resolved from both the repository and `/Users/johnku/node_modules`; Turbopack failed to bind a build-worker port, including an escalated retry. Recheck these rather than assuming they still occur. Do not change contract types or weaken type checks to hide the dependency problem.

## Task 2: Finish the map atmosphere

**Files:** `apps/web/src/game/HubAtmosphere.ts`, `apps/web/src/game/HubScene.ts`.

Keep this boundary:

```ts
constructor(scene: Phaser.Scene, map: Phaser.Tilemaps.Tilemap)
update(time: number, reducedMotion: boolean): void
```

- [ ] Keep a fixed maximum of 24 one-pixel world-space motes, placed deterministically within map bounds. Reuse display objects; never allocate particles or tweens per frame.
- [ ] Drift approximately 7px horizontally and 5px vertically over several seconds, with a smooth fade up to alpha `0.65`. Preserve nearest-neighbor rendering. Avoid covering gate labels or React controls.
- [ ] Create warm amber halos only at actual torch/lantern positions from the props layer. Support all three torch frame GIDs as well as lanterns if present in the authored map. Guard empty cells if the installed Phaser types allow them.
- [ ] Keep halos subtle: radius about 15 world pixels, alpha `0.075–0.125`, with phase offsets. Place them above ground detail but below characters and foreground foliage.
- [ ] When reduced motion is enabled, hide all motes immediately and hold halo alpha at `0.1`. Verify live preference changes, not just initial load. Reuse the existing scene preference listener.
- [ ] Preserve existing water/fire tile animation and gate proximity pulse. Confirm reduced motion still freezes tile animation and removes the gate's scale pulse.
- [ ] Ensure scene shutdown destroys decorative objects via Phaser ownership and clears retained collections when restarting. Do not introduce a separate global animation loop.

Acceptance: sparse, warm environmental movement visible during exploration; clear player silhouette and unchanged walkable routes; stable object count after several minutes.

## Task 3: Finish optional sound and its lifecycle

**File:** `apps/web/src/components/HubSoundControl.tsx`. Extract `apps/web/src/game/HubAudio.ts` only if managing active audio nodes makes the component difficult to read.

Keep the React interface:

```ts
HubSoundControl({ bridge }: { bridge: GameBridge })
```

Sound vocabulary (reuse the draft's sine-wave envelopes):

| Trigger | Frequencies, Hz | Timing |
| --- | --- | --- |
| Enable sound | 523.25, 783.99 | 75ms apart |
| Enter active gate approach | 523.25, 659.25 | 75ms apart |
| Enter locked gate approach | 196 | single tone |
| Open active gate | 392, 523.25, 783.99 | 75ms apart |
| Inspect locked gate | 196, 164.81 | 75ms apart |

- [ ] Start muted on every fresh page load. Create/resume AudioContext only inside the sound button's user gesture. Do not save an autoplay preference.
- [ ] Use a short attack of about 12ms and decay ending around 250ms per note. Keep gain quiet (draft peak `0.045` per voice); check perceived loudness with actual playback.
- [ ] Add a 600ms cooldown to discovery cues so crossing a gate boundary repeatedly does not chatter. Explicit open cues should still play immediately.
- [ ] Cap active/scheduled voices, including overlapping discovery and open cues, at eight. Stop/disconnect the oldest voice if needed; remove finished voices from tracking.
- [ ] On mute, stop pending and active voices before suspending so an interrupted chime does not replay on the next enable. On unmount, detach subscriptions, stop voices, and close the context.
- [ ] Suppress new cues while `document.hidden`. On visibility loss, stop outstanding voices; do not resume sound automatically when the tab becomes visible. If the browser suspends audio, allow explicit re-enable and make the toggle truthful.
- [ ] Guard asynchronous resume against unmount, rapid repeated clicks, and stale AudioContext instances. A rejected resume must show retry state without an unhandled promise rejection or leaked context.
- [ ] Keep a stable accessible name `Map sound effects`, `aria-pressed`, and a visible focus ring. Use `SOUND · OFF`, `SOUND · ON`, and `SOUND · RETRY` labels. Report playback failure accessibly with a short status message.

Acceptance: no audio on load, quiet distinct feedback after opt-in, immediate mute, no resumed old notes, no duplicate cues after development remounts.

## Task 4: Integrate with the map UI and keyboard

**Files:** `apps/web/src/components/GameShell.tsx`, `apps/web/src/game/HubScene.ts`, and `HubSoundControl.tsx`.

- [ ] Keep the sound button at the map's top right opposite `HUB · FIXTURE MAP`. Use the existing colors and typography. Make its hit area at least 36px tall without overwhelming the map.
- [ ] Verify that Space/Enter on a focused sound button does not also trigger gate interaction. In the scene's interaction callback, ignore events whose target is an interactive HTML element; use a shared local check for `button, a, input, select, textarea, [contenteditable="true"], [role="button"]` if movement handling needs the same guard.
- [ ] Preserve the existing modal pause for wallet, boss, and chain panels. Closing an overlay restores movement without held-key drift.
- [ ] Hide the gate prompt while any blocking overlay is open, using the same combined modal condition already sent to Phaser.
- [ ] Do not introduce a new bridge command merely to play sound: the existing `gate:near` and `gate:enter` events cover this slice.

## Task 5: Focused verification and visual/audio acceptance

Run from the repository root:

```sh
bunx tsc --noEmit -p apps/web/tsconfig.json
bun --cwd apps/web run map:check
bun run typecheck
bun run web:build
git diff --check
```

Expected: successful frontend type check, map validation, root check, build, and clean whitespace. Report an environmental failure precisely if it persists; do not present a partial check as a passing full build. No new test framework is needed. If a lifecycle bug is reproduced, add a focused regression check using the existing Bun runner where practical; avoid tests that merely restate animation constants.

- [ ] Start `bun run web:dev` and inspect the actual map at desktop width and a narrow mobile viewport. Sound controls must not overlap labels, clip, or obstruct wallet controls.
- [ ] Verify the hub with unavailable local RPC and with live local state if a local chain is already available. Keep read failures honest.
- [ ] Walk to all three gates; confirm collisions, prompt, approach sound, and open sound. Record whether audio was actually heard; screenshots alone do not verify sound.
- [ ] Stand on a gate boundary and move repeatedly across it; confirm discovery throttling. Hold an interaction key; confirm no burst of repeated audio/panels.
- [ ] Enable sound, immediately mute mid-chime, then re-enable; no old cue resumes. Hide the tab mid-chime; returning must not replay queued sound.
- [ ] Toggle reduced motion while the page is open. Motes disappear, halos settle, and existing tile/gate animation honors the preference. Sound remains independently controlled.
- [ ] Test keyboard activation of the sound control while near a gate. It must toggle only sound. Test wallet and boss overlays, Escape, and focus restoration.
- [ ] Check console errors and object/audio-node growth after navigating away and returning. Check React Strict Mode behavior during development.

## Task 6: Compact character and real directional walking (added user requirement)

The user rejected the current tall, blurred character and requested walking action. Replace the map character with an original compact dark-haired, red-jacket adventurer, approximately two heads tall. Character art is now explicitly in scope; preserve the existing master as a fallback source.

**Files:** `apps/web/public/images/player-compact-walk-master.png` (generated art reference), `apps/web/public/game/player-compact-walk.png` (validated runtime export), `apps/web/src/game/HubScene.ts`. Keep boss portraits unchanged.

- [ ] Inspect the generated master before slicing. AI-generated sheets are art sources, not guaranteed frame-perfect assets. Check all 16 poses, direction, alignment, transparency, and consistent proportions; correct inconsistent poses before declaring the sheet ready.
- [ ] Prepare a 128×128 transparent PNG with sixteen 32×32 cells, zero spacing/margin. Character opaque bounds should be roughly 18×24 pixels, feet at a consistent baseline. Use hard pixels with no blur or antialiasing. At 3× camera zoom the visible character should be roughly 72 screen pixels tall, reduced from the current 96 before CSS scaling.
- [ ] Frame rows are down, left, right, up. Each row is left-foot-forward, neutral, right-foot-forward, neutral. Frames 1, 5, 9, 13 are the respective idle poses. Do not merely duplicate a standing sprite across walk frames.
- [ ] Load via `this.load.spritesheet("player-walk", "/game/player-compact-walk.png", { frameWidth: 32, frameHeight: 32 })`. Replace only the player-master crop path; keep `makeCroppedTexture` for bosses.
- [ ] Register four looping animations `player-walk-down`, `player-walk-left`, `player-walk-right`, `player-walk-up` using rows 0–3, at 8 frames per second. Guard animation registration on scene restart with `this.anims.exists`.
- [ ] Keep sprite scale exactly 1. Remove the artificial sine-wave scale bob and side flip. Choose facing by dominant movement axis, retaining the last facing on equal diagonal input to avoid flicker; initialize facing down.
- [ ] Animate when the physics body actually changes position, not merely when a movement key is held. Pressing into a wall should settle to idle. On stop or modal open, stop animation and select the neutral frame for the last facing.
- [ ] Under reduced motion, use the appropriate static directional frame while retaining normal movement. No squash/stretch or decorative bob.
- [ ] Align sprite origin and the existing 12×8 feet collider to the actual baseline of the prepared art. Preserve world speed, collisions, y-sorting by feet position, and shadow position. Check clearance at all three gate approaches.
- [ ] Verify walking in four directions and diagonals, stop/start, wall contact, panel pause/resume, live reduced-motion changes, and scene remount. Inspect at normal game scale, not only a zoomed sprite preview.

Do not ship the enlarged generated master directly as a 32px spritesheet or assume a generic resize produces clean pixel art. If a validated runtime export cannot be produced, report the art preparation gap rather than reverting to the tall sprite and calling this task complete.

## Completion and handoff

- [ ] Review `git diff` and the two new files; include only this effects work in any commit. Do not push.
- [ ] Capture a screenshot of the finished map and, if tooling supports it, a short recording with sound. Do not claim audio verification if playback/recording was unavailable.
- [ ] Summarize effects added, reduced-motion behavior, verified commands, browser coverage, and remaining limitations. Report the resulting commit if committed; otherwise explicitly say changes remain local.

Suggested commit message: `feat(web): add map atmosphere and optional gate sounds`.
