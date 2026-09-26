# RPG Hub Art Direction

## Goal

Restyle the playable hub so it reads as a lush, warm 16-bit RPG garden like the supplied reference, while preserving Boss Pool's existing navigation, boss gates, interaction events, and React interface.

The reference establishes the visual target only. Its artwork will not be copied, traced, or committed.

## Chosen approach

Replace the current sparse pastel fixture tiles with an original, cohesive game-ready tileset and re-author the map around that richer visual language. Recoloring the existing Kenney Tiny Town sheet would retain its heavy outlines and limited environmental vocabulary. Importing another stock pack would be faster but less cohesive with the existing Boss Pool character art.

## Visual language

- Use a compact, deliberate pixel grid with nearest-neighbor rendering and no smoothing.
- Shift the palette toward saturated olive and moss greens, warm gray stone, dark forest shadows, amber fire, and small blue water accents.
- Give grass visible texture through restrained clusters, flowers, and highlights rather than uniform random noise.
- Build paths from irregular stone pavers with several variants and softened, organic edges.
- Use layered, rounded tree canopies and darker trunks to create depth and strong borders around walkable space.
- Add small fences, shrubs, flowers, water, stone details, and warm lights to make the map feel inhabited.
- Keep the center readable: decoration frames movement routes and landmarks but does not obscure the player or gate approaches.

## Map composition

The hub remains 40×30 tiles at 16×16 pixels per tile and keeps the existing 3× camera zoom. Its current straight vertical road becomes an asymmetrical garden plaza:

- A central stone clearing anchors the player and acts as the main junction.
- Curving or stepped stone paths connect the spawn area to the cat, macro-whale, and locked gates.
- Trees and fences shape distinct garden rooms instead of appearing as isolated icons on open grass.
- A small pond or water feature supplies the blue accent visible in the reference.
- Torchlight or lantern landmarks reinforce gate and plaza locations.
- The three gate markers retain their current boss IDs and remain reachable through the same interaction flow.

The layout may move spawn and gate coordinates when needed for composition. Those coordinates remain authored in the Tiled JSON marker layer rather than TypeScript.

## Rendering structure

Retain Phaser's built-in tilemap and the existing layer-based architecture. The map will use separate ground, ground-detail, props, overhead, and invisible collision concerns as needed. Y-sorted player and gate art must continue to pass correctly behind foreground foliage and structures.

The existing game bridge remains unchanged: `scene:ready`, `gate:near`, `gate:enter`, and `ui:modal` keep their current names and responsibilities. React continues to own the surrounding HUD and boss entry panel.

## Asset constraints

- Create original environment artwork rather than imitating identifiable tiles from the reference.
- Keep the environment spritesheet under `apps/web/public/game/` and document its origin in the repository.
- Do not add a runtime dependency or a second rendering engine.
- Existing Boss Pool portraits and player art remain unchanged unless minor scaling or positioning is needed to sit naturally in the new environment.
- Keep the visible `HUB · FIXTURE MAP` label until the project explicitly promotes the art from fixture status.

## Interaction and accessibility

Movement, collision, camera follow, keyboard controls, reduced-motion handling, and boss-panel behavior remain functionally unchanged. Animated fire or water may use short tile animation, but reduced-motion mode must avoid nonessential movement. Walkable paths need adequate contrast from blocking foliage.

## Verification

- Validate every tile layer length and every referenced tile ID in `hub.json`.
- Run `bun run typecheck` and `bun run web:build`.
- Inspect the hub in-browser at desktop size for crisp rendering, route clarity, collision accuracy, correct foreground depth, and reachable gate interactions.
- Compare the result side by side with the supplied reference for palette, density, path treatment, environmental layering, and warmth—not for exact copied composition.
- Confirm both normal and reduced-motion behavior.

## Out of scope

This pass does not redesign the surrounding React shell, change game economy or chain behavior, add new bosses, or replace the existing character and boss portraits.
