# Hub Beginner Guide Implementation Plan

**Goal:** Teach movement and boss-pool discovery through a short introduction that advances as the player explores.

**Architecture:** React owns guide state, persistence, and hint UI. Phaser reports actual movement and renders a subtle world-space direction indicator using existing gate markers. Reuse existing `gate:near`, `gate:enter`, and `ui:modal` behavior. No dependencies.

**Execution:** The user approved this flow. Implement sequentially, using the executing-plans skill if available. No new design approval is required.

## Scope and coordination

- Read root/web AGENTS.md and implementation, testing, and model-routing guides.
- Current inspected branch: `feat/map-atmosphere`. Recheck branch and working tree before editing; do not automatically switch or reset.
- Preserve uncommitted background music changes in `HubSoundControl.tsx` and `HubMusic.ts`.
- Another partner owns playable battle entry. Do not edit `BossEntryPanel.tsx`, enrollment, battle routing, wallet behavior, contracts, or battle buttons.
- Integrate through existing gate events and GameShell panel state. Review current GameShell before patching because the partner may modify it concurrently.
- No touch controls. No forced wallet connection, sound activation, or transaction.
- Keep both `cat` and `macro-whale` eligible for discovery because they are currently unlocked map destinations; this does not imply either has a playable deployed contract. The `locked` gate never completes discovery.

## Agreed flow and exact copy

| State | Copy | Completion |
| --- | --- | --- |
| Welcome | “Explore the garden and find a boss pool to challenge.” | Start or Skip |
| Move | “Use WASD or arrow keys to move.” | Travel 24 world pixels after Start |
| Find | “Find a boss pool to challenge.” | Approach any unlocked boss gate |
| Inspect | “Press E to inspect this boss pool.” | Open that unlocked gate's existing panel |
| Done | “You're ready to explore. Choose a boss pool whenever you're ready.” | Dismiss; guide is already marked complete |

Show welcome once per browser storage profile. Skip is always available during the active guide. Add Replay guide for returning players. Persist only completion or skip; an interrupted incomplete guide restarts at Welcome on reload.

## Files and interfaces

- Create `apps/web/src/lib/hubGuide.ts`: pure transitions and storage-key constant.
- Create `apps/web/src/lib/hubGuide.test.ts`: focused transition tests with Bun.
- Create `apps/web/src/lib/useHubGuide.ts`: React lifecycle, storage, and bridge integration.
- Create `apps/web/src/components/HubGuide.tsx`: welcome dialog and compact hint cards.
- Modify `apps/web/src/game/bridge.ts`: additive guide command and movement event.
- Modify `apps/web/src/game/HubScene.ts`: actual movement progress and directional hint.
- Modify `apps/web/src/components/GameShell.tsx`: mount guide, combine modal state, confirm panel opening.

Do not add a second game-state store or poll `window.__bpHub` from product code.

## Task 1: Pure progression and acceptance checks

- [ ] Define `GuideStep = "welcome" | "move" | "find" | "inspect" | "done" | "hidden"` and `GuideState = { step: GuideStep; nearBoss: BossId | null }`.
- [ ] Export `HUB_GUIDE_STORAGE_KEY = "boss-pool:hub-guide:v1"`.
- [ ] Implement `transitionGuide(state, action): GuideState` with a discriminated action union: `start`, `moved`, `near` carrying `bossId`, `opened` carrying `bossId`, `skip`, `replay`, and `dismiss`.
- [ ] Use `findBoss(id).locked` for eligibility rather than matching the cat ID. Keep `nearBoss` updated even in Welcome/Move so a player already beside a gate can advance without leaving and reentering.
- [ ] Start moves Welcome to Move. Moved advances Move to Inspect if near an unlocked gate, otherwise Find. Near advances Find to Inspect; leaving the gate or approaching a locked gate returns Inspect to Find. Opened completes only from Inspect when the opened unlocked boss matches `nearBoss`. Skip hides; Replay returns to Welcome; Dismiss hides Done.
- [ ] Add focused tests before implementation using `bun:test`: normal journey; whale journey; locked gate ignored; leaving gate returns to Find; discovery while in Move is remembered; unrelated gate opening cannot complete; skip/replay reset progression.
- [ ] Run `bun test apps/web/src/lib/hubGuide.test.ts`, first confirming failure for the absent reducer, then passing after implementation.

## Task 2: Minimal bridge and Phaser integration

Add these members without renaming current events or commands:

```ts
// GameEvents
"guide:moved": Record<string, never>;
// GameCommands
"guide:step": { step: "off" | "move" | "find" | "inspect" };
```

- [ ] Subscribe to `guide:step` in HubScene and unsubscribe through its existing shutdown list. Receiving Move resets the distance accumulator and current position baseline. Duplicate Move commands must not reset progress; only a transition into Move does.
- [ ] Accumulate actual resolved player displacement while Move is active, the scene is not modal, and movement input is active. Do not count key presses against a wall, teleport/spawn changes, or camera motion. Emit `guide:moved` once after 24 world pixels, then stop accumulating until a new Move step.
- [ ] Reuse the existing gate zone centers to choose the nearest unlocked gate while Find is active. Never hardcode Cat Gate coordinates. Use stable tie breaking and a modest distance hysteresis to avoid flickering targets.
- [ ] Render one small amber arrow near the player pointing toward that gate. Keep it world-space and at a depth below labels; it is a bearing hint, not a pathfinding promise. Never move or steer the player automatically.
- [ ] Show the arrow only in Find, hide it for modal panels and all other guide steps, and destroy it on shutdown. Keep it static under reduced motion; a gentle opacity pulse is optional otherwise. Reuse the existing reduced-motion state.
- [ ] Maintain scene-ready synchronization: React must resend the current guide command and combined modal state on `scene:ready`. Commands sent before Phaser loads otherwise disappear. Do not reset active Move progress on a React rerender.

## Task 3: React lifecycle and once-per-browser behavior

`useHubGuide(bridge)` returns `state`, `start`, `skip`, `replay`, `dismiss`, and `panelOpened(bossId)`. It owns reducer dispatch, scene subscriptions, command synchronization, and storage writes.

- [ ] Start with guide UI unresolved/hidden during SSR and initial hydration. In a browser effect, read localStorage: `complete` or `skipped` hides it; absent/unrecognized values show Welcome. Catch storage exceptions and allow the full guide in memory.
- [ ] On Skip store `skipped`; on entering Done store `complete`. Do not wait for Dismiss to store completion. Replay removes the key and resets to Welcome; if storage is blocked, replay still works in memory.
- [ ] Subscribe to `gate:near` and `guide:moved`, cleaning up only this hook's listeners. Do not call `bridge.clear()`.
- [ ] GameShell should call `panelOpened(openBoss)` when the existing boss panel is actually open. Do not mark complete merely from an arbitrary keyboard event. Keep this integration independent of the panel's battle implementation.
- [ ] Pause guide UI and arrow when another overlay is open; retain current progress. Done should appear after the boss panel closes, without stacking another dialog over it.
- [ ] Reset movement baseline on Replay through the guide-step transition. Read current proximity when necessary through an additive explicit scene response or current GameShell `nearBoss`; do not introduce per-frame React updates.

## Task 4: Accessible welcome and unobtrusive hints

- [ ] Welcome uses a compact modal with title “Welcome to Boss Pool”, the agreed welcome copy, Start, and Skip. Add “Sound is optional—you can enable it above the map.” as secondary copy.
- [ ] Pause Phaser only for Welcome, in addition to all existing overlay conditions. Move/Find/Inspect cards must allow normal movement.
- [ ] Trap focus within Welcome, focus Start on open, Escape performs Skip, and return focus to a useful map control on close. Preserve page-control keyboard guards so pressing Space/Enter on Start does not also inspect a gate.
- [ ] Place one small step card where it does not cover the player, sound/music buttons, existing prompt, or wallet HUD. Include a step label, agreed instruction, and Skip button. Announce step changes with `aria-live="polite"`; do not announce coordinates or every frame.
- [ ] Inspect can use the existing gate prompt to avoid duplicate instructions. Keep the tutorial's wording “Press E to inspect this boss pool.”
- [ ] Put Replay guide below the map or alongside existing help, accessible by keyboard. Disable or defer Replay while another modal is open to avoid competing dialogs.
- [ ] Display Done as a dismissible nonblocking hint after the boss panel closes. Do not use a timer that removes it before it can be read.
- [ ] Honor reduced-motion CSS: only brief opacity/transform transitions, no camera movement or forced character motion.

## Task 5: Verification and partner-safe handoff

Run from the repository root:

```sh
bun test apps/web/src/lib/hubGuide.test.ts
bunx tsc --noEmit -p apps/web/tsconfig.json
bun run typecheck
bun run web:build
git diff --check
```

Record actual outcomes. The previous full root check encountered unrelated duplicate viem resolution in `scripts/exercise-boss-pool.ts`; do not hide or “fix” it by weakening types. The most recent production build passed with appropriate build-worker permissions.

- [ ] Fresh browser storage: Welcome appears after hydration, no audio starts, and Start advances through real movement, unlocked pool approach, and panel opening.
- [ ] Test Cat and Macro Whale separately, and verify the locked gate cannot complete the guide. Test stepping out of an approach zone and back in.
- [ ] Hold movement against a wall: it must not complete the movement step. Replay while already beside a gate: progress must not get stuck waiting for a new proximity event.
- [ ] Skip, reload, Replay, complete, and reload; confirm persistence. Simulate blocked storage and verify controls still work without a crash.
- [ ] Delay scene loading: Welcome still pauses input once the scene becomes ready. Check Strict Mode/remounts for duplicate listeners or lost progress.
- [ ] Open and close other panels during the guide; no competing hints, stuck input, or held-key drift. Preserve the partner's current battle-entry flow.
- [ ] Verify keyboard focus and Escape, narrow viewport layout, reduced motion, and missing RPC state. No wallet or live chain is required to learn map controls.
- [ ] Review only the changed guide files and small integration hunks. Do not stage the unrelated music files or partner changes. No push unless requested.

Deliver a summary of the flow, tested revision or uncommitted status, verification results, and any browser scenarios that could not be exercised.
