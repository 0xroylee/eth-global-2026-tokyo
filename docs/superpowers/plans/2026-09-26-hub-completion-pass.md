# Hub Completion Pass Implementation Plan

**Goal:** Make the current garden feel like a complete first region: a readable arrival, clear destinations, an intentional future exit, reusable help, and recovery from loading failure.

**Architecture:** Keep one Phaser map and the existing React shell. Author the future exit in the map generator, communicate its interaction through additive bridge events, and reuse the existing guide and modal coordination. No new dependencies, backend, routing framework, or second map.

**Execution:** Implement sequentially using executing-plans if available. The user requested a combined implementation handoff. Do not push. Respect unrelated changes and the partner's battle-entry ownership.

## Current baseline — inspect before editing

The inspected branch is `feat/hub-beginner-guide`. Guide implementation already exists in `hubGuide.ts`, `useHubGuide.ts`, `HubGuide.tsx`, and `HubScene.ts`. Walking, atmosphere, sound controls, and music are existing work: inspect and preserve them; do not reimplement them from earlier plans.

The earlier `2026-09-26-hub-beginner-guide.md` remains the guide acceptance reference. This plan is the next combined hub pass, not an instruction to recreate completed work.

Read root/web AGENTS.md, `docs/agents/implementation.md`, `docs/agents/testing.md`, and `docs/agents/models.md`. Read applicable installed Next.js documentation before changing client loading/lifecycle behavior.

Scope limits:

- No touch controls, battle entry, contract actions, wallet redesign, new bosses, or fake live statistics.
- Do not edit `BossEntryPanel.tsx` or battle implementation. Coordinate small GameShell changes against the partner's current version.
- Keep the existing map dimensions, scale, character art, movement, and collision conventions.
- Keep fixture identification visible. An unlocked map gate is not proof of a deployed or playable boss pool.
- No minimap, quest inventory, currency HUD, NPC conversations, or elaborate settings menu in this pass.

## Deliverables and exact presentation

1. Persistent location label: **GARDEN HUB**, secondary **REGION 01**, plus the existing fixture badge.
2. Future route: a stone path ending at a closed wooden barrier on the east edge. Sign: **NEXT REGION** / **COMING SOON**.
3. Exit interaction: **E · INSPECT ROUTE** opens “More boss pools are coming. This route isn't open yet.” with a Back button.
4. Boss gate labels: preserve names; add **BOSS POOL** for unlocked destinations and **LOCKED** for locked ones. Do not use “Live,” “Ready,” or “Challenge now” without canonical battle availability.
5. **HELP** panel: movement, interaction, sound/music explanation, and **REPLAY GUIDE**.
6. Short arrival fade and a usable load-failure screen with Retry.

## File map

- Modify `apps/web/scripts/generate-hub-map.ts`: reserve and draw route; author exit marker.
- Modify `apps/web/public/game/hub.json`: generated artifact only.
- Modify `apps/web/scripts/check-hub-map.ts`: exit reachability/blocking validation.
- Modify `apps/web/src/game/bridge.ts`: exit events.
- Modify `apps/web/src/game/HubScene.ts`: exit presentation, approach detection, interaction and input priority; boss label metadata.
- Create `apps/web/src/components/HubHelp.tsx`: accessible Help dialog.
- Create `apps/web/src/components/HubRouteNotice.tsx`: accessible Coming soon dialog.
- Modify `apps/web/src/components/GameShell.tsx`: location, panels, prompt priority, and modal synchronization.
- Modify `apps/web/src/components/GameCanvas.tsx`: readiness, failure, retry and fade.
- Modify existing guide files only for a demonstrated integration regression.

Do not introduce a generic region manager or generic modal framework for these two small panels. Reuse existing dialog behavior where correct, keeping focus cleanup scoped to the dialog owner.

## Task 1: Reserve an expansion route in the current map

- [ ] Read the generator, map validator, and current tileset inventory. Generate the map only through the checked-in generator.
- [ ] Reserve a 3-tile-wide east route along columns 33–38, rows 12–14, connecting to the existing east path. Reserve these cells before stone edge selection and decoration placement.
- [ ] Put a vertical closed fence/barrier at column 38, rows 12–14, using existing fence tiles. Keep column 39 and all other outer boundary cells blocked. Clear overhanging decorative canopy from the approach so the sign and player remain visible.
- [ ] Keep the approach at columns 35–37, rows 12–14 walkable. Do not displace the Macro Whale gate or alter its existing approach.
- [ ] Add one rectangle in the existing markers object layer:

```ts
{
  name: "region-exit",
  x: 38 * 16, y: 12 * 16, width: 16, height: 3 * 16,
  properties: [
    { name: "exitId", type: "string", value: "east-route" },
    { name: "status", type: "string", value: "coming-soon" }
  ]
}
```

Use a unique Tiled object ID and update next-object metadata if present. This is a separate marker type, never another boss ID.

- [ ] Extend `check-hub-map.ts` to require one `region-exit`, verify its metadata, ensure its three barrier cells remain blocked, and confirm its approach center at column 36, row 13 is reachable from spawn. Preserve the existing three boss-gate checks and outer-boundary check.
- [ ] Run `bun --cwd apps/web run map:build` and `bun --cwd apps/web run map:check`. Expect success. Regenerate twice and confirm the second output is identical.

## Task 2: Render and inspect the closed route

Add only these bridge events:

```ts
"region:near": { exitId: "east-route" | null };
"region:inspect": { exitId: "east-route" };
```

- [ ] Read `region-exit` from Tiled markers. Render the sign at the barrier with nearest-neighbor art/text conventions matching the map. Use brown wood/amber lettering, distinguishable from the portrait-based boss gates. No large portal glow or boss portrait.
- [ ] Build its approach zone from marker geometry: extend 48px west of the barrier and match its 48px height. Do not hardcode another independent coordinate in the scene.
- [ ] Emit `region:near` only when proximity changes. Keep region state independent of `nearGate` and the boss arrays.
- [ ] Extend the existing interact handler: retain repeat-key and HTML-control guards; ignore interaction under a modal; prioritize an actual boss gate if zones overlap; otherwise emit `region:inspect` when in the route approach. E is the documented key; preserve existing Enter/Space support.
- [ ] Opening the notice must never emit `gate:enter`, advance the guide, request a wallet, or transition maps. Keep the barrier physically impassable.
- [ ] Clean up new subscriptions/objects on scene shutdown and reset cached proximity state on restart. No new per-frame React updates.

## Task 3: Integrate route notice and preserve beginner guidance

- [ ] Add `HubRouteNotice` with title “Next region”, badge “Coming soon”, body “More boss pools are coming. This route isn't open yet.”, and **BACK · ESC**. No disabled travel button is needed.
- [ ] Use an accessible dialog: focus Back on opening, contain Tab focus, Escape closes, restore focus to an appropriate map control. Prevent the closing key event from triggering a gate interaction underneath.
- [ ] In GameShell, subscribe to route proximity and inspect events. Add route notice state to the existing combined modal condition and scene-ready resynchronization.
- [ ] Show `E · INSPECT ROUTE` near the route only when no modal is open. Keep one contextual prompt visible at a time: guide inspection/boss prompt takes priority over route prompt.
- [ ] The tutorial still says “Find a boss pool to challenge.” Preserve unlocked boss discovery behavior and exclude the expansion route completely. When a route notice closes, restore the same guide step and arrow.
- [ ] Replay and help controls must not open on top of the route notice. Retain current guide completion/skip persistence and exact storage key.

## Task 4: Location identity, pool labels and Help

- [ ] Display **GARDEN HUB** / **REGION 01** as a compact location heading adjacent to or above the map. Keep `HUB · FIXTURE MAP` visible separately. Avoid overlapping the guide card or audio controls.
- [ ] Add a small **BOSS POOL** caption to unlocked gate nameplates; preserve existing names and locked labels. Do not invent availability, player counts, prizes, or completion percentages.
- [ ] Add a Help button below the map near the existing Replay guide control. Help content:

| Control | Description |
| --- | --- |
| WASD / arrow keys | Move around the garden |
| E | Inspect a nearby boss pool or route |
| Escape | Close the current panel |
| Sound / Music | Optional audio controls above the map |

- [ ] Include “Find a boss pool to challenge. Closed routes lead to future regions.” and a **REPLAY GUIDE** button. Reuse `guide.replay`; do not create a second tutorial state.
- [ ] Close Help first, then replay the guide. Ensure old focus-restoration cleanup cannot steal focus from the new Welcome dialog.
- [ ] Use the same dialog focus/Escape rules as the route notice. Include Help in the combined modal state. If wallet controls are present in the partner's branch, preserve their existing modal state too.
- [ ] Keep controls legible and unclipped at narrow widths; no new touch movement controls.

## Task 5: Finish the loading and arrival experience

- [ ] In GameCanvas, model `loading`, `ready`, and `error` explicitly. Catch dynamic import/game creation failures, and attach scoped Phaser loader error handling before the scene begins loading.
- [ ] Provide an error screen: “Couldn't load the garden.” and **RETRY**. Avoid raw stack traces. Retry must destroy the previous game, detach listeners and restart once; rapid clicks must not create multiple canvases.
- [ ] Add a 20-second loading watchdog for hangs, clear it on ready/error/unmount. Do not overwrite a newer retry's state with an older import, scene-ready callback or timer; use a generation token or equivalent scoped cancellation.
- [ ] If assets finish late after timeout, keep lifecycle behavior consistent: clean up that failed generation before retry. Account for partially constructed games.
- [ ] On ready, use a 200–300ms opacity-only reveal. Disable the transition under reduced motion. No forced camera pan, zoom, blackout flash or player movement.
- [ ] Keep Welcome and guide state coordinated with readiness: load errors must remain reachable and not be hidden underneath an onboarding overlay. Retry should preserve guide state in memory and resend modal/guide commands after the new scene emits ready.

## Task 6: Focused verification and handoff

Run:

```sh
bun --cwd apps/web run map:build
bun --cwd apps/web run map:check
bun test apps/web/src/lib/hubGuide.test.ts
bunx tsc --noEmit -p apps/web/tsconfig.json
bun run typecheck
bun run web:build
git diff --check
```

Use existing tests and validators. Add a focused regression test only for new transition/lifecycle logic that benefits from one; do not introduce a new test framework or snapshot suite. Record environmental failures explicitly. A previous root typecheck failed from duplicate viem resolution in an unrelated exercise script; do not weaken types to conceal it.

Browser acceptance:

- [ ] Start with fresh guide storage. Complete Move → Find → Inspect at either unlocked boss; route inspection must not complete Find.
- [ ] Walk to east route; check sign visibility, collision, contextual prompt and notice. Confirm all three original boss approaches remain reachable.
- [ ] Open Help during normal exploration; verify movement pauses, Escape closes, Replay opens Welcome correctly, and focus stays within the active dialog.
- [ ] Repeatedly open/close Help, route notice and a boss panel. Verify no competing dialogs, duplicate events or held-key drift.
- [ ] Simulate a failed map or sprite request using browser request blocking. Error and Retry must be visible. Remove blocking, retry and confirm exactly one playable scene and resynchronized guide.
- [ ] Check delayed loading, remount, and reduced motion. Verify header/hints/audio controls remain readable at desktop and narrow widths.
- [ ] Preserve sound/music behavior and the partner's battle entry. Verify public hub rendering with missing/unreachable local RPC; test live local reads when available.

Complete with a screenshot of the hub and exit, verification results, tested revision or uncommitted status, and any untested browser scenarios. Commit only owned changes if committing; do not stage the partner's unrelated work. Suggested commit sequence: route map, route interaction, Help/location polish, loading recovery.

## Deferred

Actual region loading is a future slice. The typed exit marker supplies a stable attachment point without requiring that infrastructure now. Battle entry remains the partner's work. Do not use polish to imply an unavailable boss is playable.
