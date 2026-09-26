# RPG Hub Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sparse pastel fixture map with an original, lush 16-bit RPG garden while preserving movement, collision, three boss gates, reduced motion, and the React bridge.

**Architecture:** Keep Phaser's 40×30, 16px Tiled map and 3× camera zoom. Replace the environment atlas, generate the JSON map deterministically from a checked-in TypeScript authoring script, and extend `HubScene` only for the new visual layers and optional tile animation. The React shell and chain-facing code do not change.

**Tech Stack:** Next.js 16, React 19, TypeScript 7, Phaser 4.2.1 tilemaps and Arcade Physics, Bun scripts, original PNG pixel art.

## Global Constraints

- Work on `feat/hub-tilemap`; do not switch to or commit on `main`.
- Read `AGENTS.md`, `apps/web/AGENTS.md`, `docs/agents/implementation.md`, `docs/agents/testing.md`, and `docs/superpowers/specs/2026-09-26-rpg-hub-art-direction-design.md` before editing.
- Treat the supplied screenshot as visual direction only. Do not copy, trace, ship, or derive individual tiles from it.
- Preserve the 40×30 map, 16×16 tile size, camera zoom `3`, `pixelArt: true`, `antialias: false`, and pixelated canvas scaling.
- Preserve bridge events `scene:ready`, `gate:near`, `gate:enter`, and command `ui:modal`.
- Preserve boss IDs `cat`, `macro-whale`, and `locked`.
- Keep the visible badge `HUB · FIXTURE MAP`.
- Add no runtime dependency and no second renderer.
- Do not edit `contracts/`, `packages/chain/`, round accounting, attack behavior, or reward copy.
- Keep all routes to gates walkable and keep decoration out of gate approach zones.
- Run only the focused map validator, `bun run typecheck`, `bun run web:build`, and browser verification; do not add Jest, Vitest, or Playwright.
- Make one commit per task. Do not push unless the user asks.

---

## File structure

- Replace: `apps/web/public/game/tiles.png` — original 256×128 RGBA atlas, 16 columns × 8 rows, no margin or spacing.
- Replace: `apps/web/public/game/TILESET-LICENSE.txt` — records that the new environment atlas is original project artwork; removes the obsolete Kenney inventory.
- Create: `apps/web/src/game/hubTiles.ts` — one authoritative set of atlas GIDs and layer names.
- Create: `apps/web/scripts/generate-hub-map.ts` — deterministic map authoring and JSON output.
- Create: `apps/web/scripts/check-hub-map.ts` — focused structural and reachability check.
- Modify: `apps/web/public/game/hub.json` — generated map artifact.
- Modify: `apps/web/package.json` — `map:build` and `map:check` commands.
- Modify: `apps/web/src/game/HubScene.ts` — renders the extra detail layer and optional water/fire animation without changing bridge behavior.

`GameCanvas.tsx`, `createGame.ts`, `bridge.ts`, `bosses.ts`, `GameShell.tsx`, and all chain files remain unchanged.

---

### Task 1: Original environment atlas and stable tile contract

**Files:**
- Replace: `apps/web/public/game/tiles.png`
- Replace: `apps/web/public/game/TILESET-LICENSE.txt`
- Create: `apps/web/src/game/hubTiles.ts`

**Interfaces:**
- Consumes: Phaser/Tiled's one-based GID convention; transparent/empty map cells remain JSON value `0`.
- Produces: `HUB_TILESET` and `HUB_LAYERS`, imported by the generator and validator; a 256×128 atlas whose cell positions match those constants.

- [ ] **Step 1: Establish the atlas contract before drawing**

Create `apps/web/src/game/hubTiles.ts` exactly as follows. Unused atlas cells must remain transparent so later additions do not renumber existing tiles.

```ts
export const HUB_LAYERS = {
  ground: "ground",
  detail: "ground-detail",
  props: "props",
  overhead: "overhead",
  collision: "collision",
  markers: "markers",
} as const;

export const HUB_TILESET = {
  name: "hub",
  image: "tiles.png",
  tileSize: 16,
  columns: 16,
  rows: 8,
  width: 256,
  height: 128,
  tileCount: 128,
  gid: {
    grass: 1,
    grassTuft: 2,
    grassFlowersYellow: 3,
    grassFlowersWhite: 4,
    grassLight: 5,
    stoneCenterA: 9,
    stoneCenterB: 10,
    stoneCenterC: 11,
    stoneEdgeN: 12,
    stoneEdgeE: 13,
    stoneEdgeS: 14,
    stoneEdgeW: 15,
    stoneCorner: 16,
    waterA: 33,
    waterB: 34,
    waterEdgeN: 35,
    waterEdgeE: 36,
    waterEdgeS: 37,
    waterEdgeW: 38,
    waterCorner: 39,
    shrub: 49,
    hedge: 50,
    treeTrunk: 51,
    treeCanopyLeft: 65,
    treeCanopyCenter: 66,
    treeCanopyRight: 67,
    treeCanopyLowerLeft: 68,
    treeCanopyLowerCenter: 69,
    treeCanopyLowerRight: 70,
    fenceHorizontal: 81,
    fenceVertical: 82,
    fencePost: 83,
    rock: 84,
    flowerOrange: 85,
    flowerBlue: 86,
    torchA: 97,
    torchB: 98,
    torchC: 99,
    lantern: 100,
  },
} as const;
```

- [ ] **Step 2: Create the atlas artwork**

Create an original `apps/web/public/game/tiles.png` with these exact technical properties:

- PNG with alpha, 256×128 pixels, 16×16 cells, no margin, no spacing.
- Every occupied cell aligns to the GID declared above: `gid = row * 16 + column + 1`.
- Use a restricted palette built around `#5f8f2f`, `#83ad39`, `#31562b`, `#173b28`, `#8a8268`, `#b0a582`, `#e9b13f`, and `#4f9bd9`; nearby shades are allowed for highlights and shadows.
- Use hard pixel edges only: no antialiasing, blur, translucent fringe, soft shadow, texture filter, or resampling.
- Grass tiles must tile seamlessly on all four edges.
- Path stones must have irregular silhouettes and at least three center variants.
- Tree canopy pieces must assemble into a 3×2 crown, with the lower row leaving trunk/ground readable.
- Water A/B and torch A/B/C are animation frames with identical silhouettes.
- Flowers and grass details must remain readable but subordinate to the player sprite.

Inspect the atlas at both 1× and 8×. At 1×, every prop must remain recognizable; at 8×, no partial pixels or smoothed edges may appear.

- [ ] **Step 3: Replace the attribution record**

Replace `apps/web/public/game/TILESET-LICENSE.txt` with:

```text
Asset: Boss Pool RPG Hub environment atlas
File: tiles.png
Dimensions: 256x128 pixels
Grid: 16x16 pixels, 16 columns x 8 rows, margin 0, spacing 0
Origin: Original artwork created for Boss Pool
Created: 2026-09-26

The supplied RPG screenshot was used only as broad visual direction for palette,
density, path treatment, environmental layering, and warmth. No screenshot tile
or identifiable artwork was copied, traced, or included.

This atlas is part of the Boss Pool project. Existing character and boss artwork
in public/images is separate from this environment atlas.
```

- [ ] **Step 4: Verify image dimensions and transparency**

Run:

```sh
sips -g pixelWidth -g pixelHeight -g hasAlpha apps/web/public/game/tiles.png
```

Expected: `pixelWidth: 256`, `pixelHeight: 128`, and `hasAlpha: yes`.

- [ ] **Step 5: Commit the atlas contract and artwork**

```sh
git add apps/web/public/game/tiles.png apps/web/public/game/TILESET-LICENSE.txt apps/web/src/game/hubTiles.ts
git commit -m "art(web): replace the hub environment atlas"
```

---

### Task 2: Deterministic garden map and reachability check

**Files:**
- Create: `apps/web/scripts/generate-hub-map.ts`
- Create: `apps/web/scripts/check-hub-map.ts`
- Modify: `apps/web/package.json`
- Replace: `apps/web/public/game/hub.json`

**Interfaces:**
- Consumes: `HUB_TILESET` and `HUB_LAYERS` from `src/game/hubTiles.ts`.
- Produces: a 40×30 Tiled JSON map with six named layers and markers at exact coordinates; `map:check` exits nonzero for invalid tile IDs, layer sizes, marker IDs, blocked spawn/gates, or unreachable gates.

- [ ] **Step 1: Add map commands**

Add these entries to `apps/web/package.json` under `scripts`:

```json
"map:build": "bun scripts/generate-hub-map.ts",
"map:check": "bun scripts/check-hub-map.ts"
```

- [ ] **Step 2: Write the failing validator first**

Create `apps/web/scripts/check-hub-map.ts`. It must:

1. Read `public/game/hub.json` with `Bun.file`.
2. Assert map dimensions `40×30`, tiles `16×16`, tileset name `hub`, image `tiles.png`, image size `256×128`, columns `16`, and tile count `128`.
3. Assert tile layers exist in this order: `ground`, `ground-detail`, `props`, `overhead`, `collision`; each has exactly `1200` integers between `0` and `128`.
4. Assert one `markers` object layer contains exactly one point named `spawn` and three rectangles named `gate` with boss IDs `cat`, `macro-whale`, and `locked`.
5. Convert spawn and the center of each gate approach to tile coordinates.
6. Flood-fill four-directionally over cells whose collision value is `0`; assert all three approach cells are reachable from spawn.
7. Assert every outer-edge cell has collision and every 2×2 pond interior cell has collision.
8. Print `hub map check passed` on success.

Use a local `assert(condition: unknown, message: string): asserts condition` helper that throws `new Error(message)` when false. Do not add a test framework.

- [ ] **Step 3: Run the validator against the old map**

Run:

```sh
bun --cwd apps/web run map:check
```

Expected: FAIL because the old tileset metadata is `192×176`, has no `ground-detail` layer, and does not match the new atlas contract.

- [ ] **Step 4: Author the deterministic generator**

Create `apps/web/scripts/generate-hub-map.ts` with these fixed composition rules:

- Constants: `WIDTH = 40`, `HEIGHT = 30`, `TILE = 16`, `SPAWN = { col: 20, row: 25 }`.
- Markers: cat gate `{ col: 7, row: 4, width: 3, height: 2 }`; locked gate `{ col: 19, row: 2, width: 3, height: 2 }`; macro-whale gate `{ col: 32, row: 4, width: 3, height: 2 }`.
- Fill ground with `grass`; use deterministic coordinate predicates such as `(col * 17 + row * 31) % 29` for grass/detail variation. Do not call `Math.random()`.
- Reserve an organic central clearing covering columns `15..25`, rows `10..20`; use stone center variants and edge/corner tiles.
- Build three 3-tile-wide walkable routes: spawn to clearing, clearing to cat, clearing to locked, and clearing to macro-whale. Use stepped horizontal/vertical segments rather than one uninterrupted straight road.
- Build a pond covering columns `4..9`, rows `20..25`; water interior is blocked and edged with the declared water tiles.
- Place trees as assembled 3×2 crowns along the map border and in clustered garden rooms, never on a route or within a 5×4 tile gate approach.
- Add fences to suggest boundaries but leave at least two tiles of clear path at every opening.
- Add flowers, shrubs, rocks, and lanterns only after paths, approaches, and pond are reserved.
- Put base terrain in `ground`, walkable flowers/grass accents in `ground-detail`, lower tree/fence/rock art in `props`, upper canopy art in `overhead`, and blocker GIDs in invisible `collision`.
- Make every outer-edge tile blocked.
- Emit compact valid Tiled JSON to `public/game/hub.json` with `Bun.write` and a trailing newline.

Keep helper boundaries focused: `index(col,row)`, `setTile(layer,col,row,gid)`, `fillRect(...)`, `reserveRoute(...)`, `placeTree(...)`, and `toTileLayer(name,data,id)`.

- [ ] **Step 5: Generate and validate the map**

Run:

```sh
bun --cwd apps/web run map:build
bun --cwd apps/web run map:check
```

Expected: the first command rewrites `public/game/hub.json`; the second prints `hub map check passed` and exits `0`.

- [ ] **Step 6: Commit the map authoring pipeline**

```sh
git add apps/web/package.json apps/web/scripts/generate-hub-map.ts apps/web/scripts/check-hub-map.ts apps/web/public/game/hub.json
git commit -m "feat(web): author the RPG garden hub map"
```

---

### Task 3: Render the richer layer stack and environmental animation

**Files:**
- Modify: `apps/web/src/game/HubScene.ts`

**Interfaces:**
- Consumes: layer names from `HUB_LAYERS`, atlas animation GIDs from `HUB_TILESET.gid`, and the existing Tiled object markers.
- Produces: the same `HubScene` bridge behavior and developer probe, with one extra ground-detail layer plus reduced-motion-aware water/fire animation.

- [ ] **Step 1: Import the map contract**

Add:

```ts
import { HUB_LAYERS, HUB_TILESET } from "./hubTiles";
```

Replace string literals for layer names and tileset name with the constants. Continue loading the image under Phaser key `tiles` and the JSON under key `hub`.

- [ ] **Step 2: Render the new layer order**

In `create()`, create layers in this order and depth:

```ts
map.createLayer(HUB_LAYERS.ground, tileset, 0, 0)?.setDepth(0);
map.createLayer(HUB_LAYERS.detail, tileset, 0, 0)?.setDepth(1);
map.createLayer(HUB_LAYERS.props, tileset, 0, 0)?.setDepth(2);
map.createLayer(HUB_LAYERS.overhead, tileset, 0, 0)?.setDepth(OVERHEAD_DEPTH);
const collision = map.createLayer(HUB_LAYERS.collision, tileset, 0, 0);
```

Keep the collision layer invisible and call `setCollisionByExclusion([-1])` exactly as the existing scene does.

- [ ] **Step 3: Add reduced-motion-aware tile animation**

Add a private method that returns immediately when `this.reduceMotion` is true. Otherwise create Phaser tile animations for water GIDs `33/34` at 2 fps and torch GIDs `97/98/99` at 6 fps, then apply them to matching tiles in visible layers. Use Phaser's tile animation API available in the installed 4.2.1 typings; do not add a custom frame timer. If Phaser 4.2.1 does not expose animated tiles for JSON-created layers, leave water and torch on their first frame and record that verified limitation in the Task 3 commit message—do not add a plugin.

Call this method only after `watchReducedMotion()` has initialized `this.reduceMotion`. When the media query changes to reduced motion, stop tile animation or restore the first frame using the same Phaser API; gate glow behavior remains unchanged.

- [ ] **Step 4: Preserve player and gate readability**

Run the scene and adjust only these existing presentation values if the new art requires it:

- player crop output remains 32px high;
- boss portrait crop output remains 28px high;
- player body remains 12×8 at the feet;
- gate blocker remains 48×32;
- gate approach rectangle remains at least 64×40 pixels;
- labels remain above `OVERHEAD_DEPTH`.

Do not change event names, boss IDs, `PLAYER_SPEED`, keyboard bindings, or gate modal behavior.

- [ ] **Step 5: Run static verification**

From the repository root, run:

```sh
bun --cwd apps/web run map:check
bun run typecheck
bun run web:build
```

Expected: map check prints `hub map check passed`; typecheck exits `0` with no diagnostics; build exits `0` and generates the production app.

- [ ] **Step 6: Commit the renderer update**

```sh
git add apps/web/src/game/HubScene.ts
git commit -m "feat(web): render the layered RPG hub"
```

---

### Task 4: Browser art-direction and interaction acceptance

**Files:**
- Modify if required by findings: `apps/web/public/game/tiles.png`
- Modify if required by findings: `apps/web/scripts/generate-hub-map.ts`
- Regenerate if required by findings: `apps/web/public/game/hub.json`
- Modify if required by findings: `apps/web/src/game/HubScene.ts`

**Interfaces:**
- Consumes: the completed atlas, generated map, existing `window.__bpHub` development probe, and the supplied visual reference.
- Produces: recorded acceptance evidence in the final handoff and no known blocked routes or depth errors.

- [ ] **Step 1: Start the local frontend**

Run:

```sh
bun run web:dev
```

Open the printed localhost URL at a desktop viewport. Missing RPC/deployment state is acceptable for this visual pass; the public hub must still render without a connected wallet.

- [ ] **Step 2: Check the initial composition**

At spawn, verify all of the following visually:

- the scene reads as olive/moss green rather than pastel mint;
- stone paths use multiple irregular variants and do not read as a single tan rectangle;
- trees form layered boundaries and garden rooms rather than isolated outlined icons;
- at least one blue pond and multiple warm amber light accents are visible while traversing the map;
- grass detail is dense but the player silhouette remains immediately legible;
- pixels remain crisp with no canvas smoothing;
- `HUB · FIXTURE MAP` remains visible.

- [ ] **Step 3: Traverse every route**

Use WASD or arrows to walk from spawn to cat, locked, and macro-whale gates. At each gate, inspect `window.__bpHub?.()` and verify `nearGate` becomes the expected ID. Press `E` and verify the existing React panel opens. Close it and verify movement resumes.

Also verify the player cannot enter the pond, walk through tree trunks/fences, or leave the outer map edge.

- [ ] **Step 4: Check depth and reduced motion**

Walk behind at least one lower tree canopy and one overhead fence/canopy tile. Verify the player is occluded only by the intended overhead pixels and never disappears behind a full rectangular tile.

Enable `prefers-reduced-motion: reduce`, reload, and verify gate feedback still uses opacity, player walk bob is absent, and water/torch tiles are static. Restore the normal preference and verify optional animations resume.

- [ ] **Step 5: Tune only against failed acceptance checks**

For an art failure, edit the atlas or deterministic placement rules; do not hand-edit generated `hub.json`. For a collision/reachability failure, edit the generator, regenerate, and rerun `map:check`. For a depth/animation failure, edit `HubScene.ts`.

After any correction, run:

```sh
bun --cwd apps/web run map:build
bun --cwd apps/web run map:check
bun run typecheck
bun run web:build
```

Expected: all four commands exit `0`; the map check prints `hub map check passed`.

- [ ] **Step 6: Commit final visual tuning**

If files changed during acceptance:

```sh
git add apps/web/public/game/tiles.png apps/web/scripts/generate-hub-map.ts apps/web/public/game/hub.json apps/web/src/game/HubScene.ts
git commit -m "fix(web): tune the RPG hub composition"
```

If no file changed, do not create an empty commit.

- [ ] **Step 7: Record the tested revision**

Run:

```sh
git rev-parse --short HEAD
git status --short
```

Expected: a short commit SHA and no output from `git status --short`. Include the SHA, the three successful verification commands, all three reachable gate IDs, and any Phaser tile-animation limitation in the implementation handoff.
