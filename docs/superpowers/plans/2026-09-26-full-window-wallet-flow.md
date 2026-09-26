# Full-window Hub and Contextual Wallet Flow

**Goal:** Fill the browser with the garden, let visitors explore immediately, and request a wallet only when they choose to challenge a boss pool or explicitly connect from the HUD.

**Architecture:** A viewport-sized Phaser host with compact React overlays. Reuse the existing wallet provider when integrated, retain the selected boss in React during wallet requests, and hand control back to the partner-owned battle panel after connection. No automatic transactions.

## Baseline and ownership

Read repository/web AGENTS.md and the implementation/testing/model guides before work. Inspect installed Next.js and Phaser APIs before modifying lifecycle and scaling code.

The inspected `feat/hub-beginner-guide` branch already includes the guide, Help, coming-soon route, and loading recovery. It currently does **not** contain wallet components, although wallet implementation exists on another development branch. Inspect available branches/commits and coordinate that integration before adding wallet UI; do not create a duplicate provider or blindly cherry-pick overlapping shell changes.

The user approved this experience. Another partner owns playable battle entry. Deliver the layout independently, then integrate a small agreed wallet handoff with that partner. Do not overwrite their panel, enrollment, routing or transaction implementation. Preserve uncommitted work. No touch controls or dependency additions. Do not push.

## User journey

1. Load the game full-window. Start Game enters the existing guide without requesting wallet access.
2. Walk, use Help, inspect pools, and visit the coming-soon route while disconnected.
3. Choose Challenge in an eligible pool's panel. If disconnected, show “Connect wallet to challenge”.
4. Connect through the existing wallet chooser. If required, offer “Switch to Base Sepolia” as an explicit action.
5. Return to the same selected pool, with refreshed connection state. The next transaction still requires its own explicit action.
6. Cancel/reject: remain at the same pool panel and position. Close the panel to continue exploring.

Connect Wallet remains available in the HUD for early connection. It must never select a boss or start a challenge by itself.

## Task 1: Full browser-window layout

**Files:** `apps/web/src/components/GameShell.tsx`, `GameCanvas.tsx`, `apps/web/src/app/globals.css` as necessary.

- [ ] Replace the centered max-width document layout with a `relative h-dvh w-full overflow-hidden` game shell. Keep a `100vh` fallback if needed. The map host fills this shell with absolute inset positioning.
- [ ] Remove the canvas wrapper's fixed aspect ratio and decorative outer card border/rounded corners. Keep loading, error and Retry overlays in the same full-size host.
- [ ] Overlay compact HUD groups: top left brand/location/fixture badge; top right wallet plus sound/music; bottom left Help/fullscreen; bottom center contextual interaction prompt. Keep diagnostic chain state in its existing control/panel rather than a page footer that creates scrolling.
- [ ] Use pointer-events-none on overlay layout containers and pointer-events-auto on controls/dialogs. Do not let decorative HUD surfaces intercept the game.
- [ ] Add safe-area padding using `env(safe-area-inset-*)`, keep visible focus indicators, and accommodate narrow windows without overlap. Panels get a bounded width, `max-height` based on viewport and internal scrolling.
- [ ] Place the guide card below the top HUD rather than retaining a hardcoded offset that overlaps the new title. Preserve welcome/readiness coordination and the once-per-browser guide behavior.

## Task 2: Responsive canvas and camera

**Files:** `apps/web/src/game/createGame.ts`, `HubScene.ts`, and `GameCanvas.tsx` only where needed.

- [ ] Replace Phaser FIT-to-fixed-960×600 behavior with the installed Phaser RESIZE mode, using actual host dimensions. Remove CSS that independently stretches a fixed-ratio canvas across the window.
- [ ] Keep 16px world tiles, pixelArt, no antialiasing, rounded camera pixels, and normal camera zoom 3. Resize the renderer/camera viewport, not the player or physics world.
- [ ] Inspect behavior where a viewport is larger than the 640×480 world at 3× zoom. Use an integer camera zoom `max(3, ceil(viewportWidth / worldWidth), ceil(viewportHeight / worldHeight))` to avoid empty space; preserve follow and bounds. On normal desktop sizes zoom remains 3. Update camera zoom on resize without respawning the player.
- [ ] Recheck label rendering resolution if zoom exceeds 3. Use integer scaling and avoid distorted characters, fractional CSS stretching, and blank exposed world edges.
- [ ] Preserve current world bounds, marker positions, collision, guide arrow, and actual-movement tracking. Browser resizing must not count as tutorial movement.
- [ ] Scope resize listeners to scene lifetime; remove them on shutdown. Confirm repeated fullscreen/resize does not create canvases or reset audio/guide state.

## Task 3: Optional browser fullscreen

**Create:** `apps/web/src/components/FullscreenControl.tsx`.

- [ ] Full-window layout works by default without Fullscreen API permission. Add a separate Fullscreen button that requests fullscreen on the game-shell element only from a user click.
- [ ] Feature-detect `requestFullscreen`/`document.fullscreenEnabled`; hide or disable with a clear explanation when unsupported. Catch rejection and keep the full-window game usable.
- [ ] Derive toggle state from `fullscreenchange`, including Escape/external exits. Exit only this shell's fullscreen session, not an unrelated element's.
- [ ] Keep dialogs, wallet controls and error screens inside the fullscreen root. Check wallet extension prompts; if the browser exits fullscreen, preserve game and selected pool state.
- [ ] Give the control accessible Enter/Exit fullscreen labels and clean up document listeners on unmount. Do not remount Phaser when toggling.

## Task 4: Agree and implement the wallet boundary

**Files:** existing wallet provider/control from the wallet integration, a focused `apps/web/src/lib/useChallengeWallet.ts` adapter if necessary, and small GameShell wiring. Partner owns battle panel changes.

Use this conceptual contract, adapting names to the actual integrated provider:

```ts
type ChallengeWalletIntent = { bossId: BossId } | null;
// Called by the partner's Challenge action only when wallet prerequisites are missing.
requestChallengeWallet(bossId: BossId): void;
cancelChallengeWallet(): void;
// Partner reads canonical wallet state; success merely restores the selected panel.
```

- [ ] Inspect the actual wallet context API and reuse its discovery, connection, chain switching, rejection handling and cleanup. If the provider is not yet integrated, finish Tasks 1–3 and document the concrete integration dependency rather than building a second implementation.
- [ ] Preserve the selected boss ID and map scene during permission/network requests. Do not reload the page, recreate the bridge, or remount the map on wallet state changes.
- [ ] HUD Connect opens the existing connection UI with no challenge intent. Challenge sets a boss-specific intent and opens the same connection UI.
- [ ] Render one active modal surface at a time; suspend the boss panel's focus trap while wallet UI owns focus, but retain selected boss state. Include wallet flow in the existing combined Phaser pause state and scene-ready resynchronization.
- [ ] After connection, explicitly offer network switching if the verified wallet chain is not Base Sepolia 84532. Do not label the connection ready until the provider confirms both the current account and chain.
- [ ] On success, restore the selected boss panel and focus its next available action. Do not automatically enroll, approve, attack, or navigate into battle based on completion of a wallet promise.
- [ ] On rejection/cancellation, show concise retryable feedback and restore the same panel. HUD-origin cancellation returns to exploration.
- [ ] Clear the intent on cancellation, closing the pool, or selecting another pool. Ignore stale asynchronous results after a newer intent, account/provider change, or component unmount. Never restore an old boss unexpectedly.
- [ ] Account changes/disconnect/wrong chain invalidate readiness. The partner must recheck current account, chain and deployment before a later write. Wallet readiness alone does not prove the selected pool is deployed or available.
- [ ] Preserve local-round versus Base-wallet network labels until a real Base deployment is integrated. Never enable a Base challenge against local manifest addresses.

## Task 5: Begin-game and Help copy

- [ ] Rename the existing welcome action to **START GAME**. Preserve Skip and Replay Guide; do not add a wallet condition to guide progression or map rendering.
- [ ] Add short welcome/help copy: “Explore freely. Connect your wallet when you're ready to challenge a boss pool.” Keep sound/music optional.
- [ ] The boss panel wallet prompt is **CONNECT WALLET TO CHALLENGE**, not an automatic popup on mere gate inspection. The partner supplies that trigger from their Challenge action.
- [ ] Preserve “Find a boss pool to challenge.” and exclude coming-soon region exits/locked gates from the tutorial targets.

## Task 6: Verify the experience

Run existing focused guide/wallet tests, frontend typecheck, root typecheck, production build and diff check. Do not install another test framework. Add a small intent-transition regression test if asynchronous wallet intent is introduced: stale success after cancel cannot restore a boss, HUD connect cannot start a challenge, selecting a different pool invalidates the prior intent.

```sh
bun test apps/web/src/lib/hubGuide.test.ts
bunx tsc --noEmit -p apps/web/tsconfig.json
bun run typecheck
bun run web:build
git diff --check
```

Run the wallet branch's existing test command after integration. Report unrelated environment/dependency failures separately; do not weaken checking to hide them.

Browser acceptance:

- [ ] Inspect 1280×720, 1920×1080, ultrawide and a narrow window: no document scrolling, distorted pixels, blank map edges, HUD overlap or inaccessible dialog buttons.
- [ ] Resize and enter/exit fullscreen while moving, at a gate and during a guide step. Preserve player position, collisions, camera follow, music and progression.
- [ ] Verify reduced motion and loading failure/Retry in the new layout.
- [ ] Start disconnected, with no wallet extension, and with RPC unavailable. Exploration and guide still work without permission prompts.
- [ ] Inspect a pool without a wallet prompt; explicitly choose Challenge to connect. Reject, retry, cancel, switch network and succeed. Each route preserves selected pool and player position.
- [ ] Connect from HUD; verify no boss is opened and no challenge starts. Change account/network and disconnect while a panel is open; readiness must update immediately.
- [ ] Confirm no transactions are sent by connection completion. Exercise real permission/network prompts with a prepared test wallet only; do not claim full wallet verification from a mocked context.
- [ ] Verify keyboard focus, Escape, one modal at a time, and normal movement resuming after close.

## Delivery

Commit only owned changes if committing, do not push, and report layout screenshots, checked viewport sizes, wallet integration status, verification results and remaining partner dependencies. If the battle trigger is not available yet, label the wallet handoff pending rather than changing the partner's battle implementation unilaterally.
