// Deterministic authoring of public/game/hub.json.
// Run from apps/web: bun run map:build, then bun run map:check.
import { fileURLToPath } from "node:url";
import { HUB_LAYERS, HUB_TILESET } from "../src/game/hubTiles";

const WIDTH = 40;
const HEIGHT = 30;
const TILE = HUB_TILESET.tileSize;
const SPAWN = { col: 20, row: 25 };
const GATES = [
  { bossId: "cat", col: 7, row: 4, width: 3, height: 2 },
  { bossId: "locked", col: 19, row: 2, width: 3, height: 2 },
  { bossId: "macro-whale", col: 32, row: 4, width: 3, height: 2 },
] as const;
const OUT_PATH = new URL("../public/game/hub.json", import.meta.url);

const G = HUB_TILESET.gid;
type LayerName = (typeof HUB_LAYERS)[keyof typeof HUB_LAYERS];

const layers: Record<Exclude<LayerName, "markers">, number[]> = {
  ground: new Array(WIDTH * HEIGHT).fill(G.grass),
  "ground-detail": new Array(WIDTH * HEIGHT).fill(0),
  props: new Array(WIDTH * HEIGHT).fill(0),
  overhead: new Array(WIDTH * HEIGHT).fill(0),
  collision: new Array(WIDTH * HEIGHT).fill(0),
};

/** Cells that decoration must leave alone: routes, clearing, pond, gates and approaches. */
const reserved = new Uint8Array(WIDTH * HEIGHT);
const stone = new Uint8Array(WIDTH * HEIGHT);

const inBounds = (col: number, row: number) => col >= 0 && row >= 0 && col < WIDTH && row < HEIGHT;
const index = (col: number, row: number) => row * WIDTH + col;
const setTile = (layer: keyof typeof layers, col: number, row: number, gid: number) => {
  if (inBounds(col, row)) layers[layer][index(col, row)] = gid;
};
const block = (col: number, row: number, gid: number) => setTile("collision", col, row, gid);
const fillRect = (col: number, row: number, w: number, h: number, fn: (c: number, r: number) => void) => {
  for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) if (inBounds(c, r)) fn(c, r);
};
const reserve = (col: number, row: number, w = 1, h = 1) => fillRect(col, row, w, h, (c, r) => { reserved[index(c, r)] = 1; });
const isReserved = (col: number, row: number) => !inBounds(col, row) || reserved[index(col, row)] === 1;

// 1. Ground variation. Coordinate predicates keep the output deterministic.
fillRect(0, 0, WIDTH, HEIGHT, (c, r) => {
  const v = (c * 17 + r * 31) % 29;
  const gid = v === 0 ? G.grassTuft : v <= 2 ? G.grassLight : v === 3 ? G.grassFlowersYellow : v === 4 ? G.grassFlowersWhite : G.grass;
  setTile("ground", c, r, gid);
});

// 2. Stone: central clearing plus stepped routes to spawn and each gate.
const markStone = (c: number, r: number) => { stone[index(c, r)] = 1; reserved[index(c, r)] = 1; };
// Organic clearing inscribed in columns 15..25, rows 10..20.
fillRect(15, 10, 11, 11, (c, r) => {
  const dx = (c - 20) / 5.6;
  const dy = (r - 15) / 5.6;
  if (dx * dx + dy * dy <= 1) markStone(c, r);
});
const reserveRoute = (col: number, row: number, w: number, h: number) => fillRect(col, row, w, h, markStone);
// Spawn to clearing, with a jog.
reserveRoute(19, 20, 3, 4); // rows 20..23
reserveRoute(20, 23, 3, 4); // rows 23..26, shifted one column east
// Clearing to cat gate: west, then north.
reserveRoute(7, 12, 9, 3); // cols 7..15, rows 12..14
reserveRoute(7, 6, 3, 7); // cols 7..9, rows 6..12
// Clearing to locked gate: north.
reserveRoute(19, 4, 3, 7); // cols 19..21, rows 4..10
// Clearing to macro-whale gate: east, then north.
reserveRoute(25, 12, 9, 3); // cols 25..33
reserveRoute(31, 6, 3, 7); // cols 31..33, rows 6..12

const isStone = (c: number, r: number) => inBounds(c, r) && stone[index(c, r)] === 1;
fillRect(0, 0, WIDTH, HEIGHT, (c, r) => {
  if (!isStone(c, r)) return;
  const n = !isStone(c, r - 1);
  const e = !isStone(c + 1, r);
  const s = !isStone(c, r + 1);
  const w = !isStone(c - 1, r);
  let gid: number;
  if (n && w) gid = G.stoneCorner;
  else if (n) gid = G.stoneEdgeN;
  else if (s) gid = G.stoneEdgeS;
  else if (w) gid = G.stoneEdgeW;
  else if (e) gid = G.stoneEdgeE;
  else {
    const v = (c * 7 + r * 13) % 3;
    gid = v === 0 ? G.stoneCenterA : v === 1 ? G.stoneCenterB : G.stoneCenterC;
  }
  setTile("ground", c, r, gid);
});

// 3. Gates and their approaches stay clear. The scene adds the gate bodies.
for (const gate of GATES) {
  reserve(gate.col - 1, gate.row - 1, gate.width + 2, gate.height + 1);
  reserve(gate.col - 1, gate.row + gate.height, 5, 4); // 5x4 approach
}
reserve(SPAWN.col - 2, SPAWN.row - 2, 5, 5);

// 4. Pond: columns 4..9, rows 20..25. Fully blocked, banked edges.
const POND = { col: 4, row: 20, w: 6, h: 6 };
fillRect(POND.col, POND.row, POND.w, POND.h, (c, r) => {
  const n = r === POND.row;
  const s = r === POND.row + POND.h - 1;
  const w = c === POND.col;
  const e = c === POND.col + POND.w - 1;
  let gid: number;
  if (n && w) gid = G.waterCorner;
  else if (n && e) gid = G.waterCornerNE;
  else if (s && w) gid = G.waterCornerSW;
  else if (s && e) gid = G.waterCornerSE;
  else if (n) gid = G.waterEdgeN;
  else if (s) gid = G.waterEdgeS;
  else if (w) gid = G.waterEdgeW;
  else if (e) gid = G.waterEdgeE;
  else gid = (c + r) % 2 === 0 ? G.waterA : G.waterB;
  setTile("ground", c, r, gid);
  block(c, r, gid);
  reserved[index(c, r)] = 1;
});
reserve(POND.col - 1, POND.row - 1, POND.w + 2, POND.h + 2);

// 5. Trees: a 3x2 crown with the trunk under the centre. Upper crown is overhead,
//    lower crown and trunk are props and block movement.
const treeFootprint = new Uint8Array(WIDTH * HEIGHT);
const canPlaceTree = (col: number, row: number) => {
  // Border trees may hang their crown off the map; the trunk must land on it.
  if (!inBounds(col + 1, row + 2)) return false;
  for (let r = row; r < row + 3; r++) for (let c = col; c < col + 3; c++) {
    if (!inBounds(c, r)) continue;
    if (treeFootprint[index(c, r)]) return false;
    // The upper crown may hang over reserved cells; the blocking rows may not.
    if (r > row && isReserved(c, r)) return false;
  }
  return true;
};
const placeTree = (col: number, row: number) => {
  if (!canPlaceTree(col, row)) return false;
  const upper = [G.treeCanopyLeft, G.treeCanopyCenter, G.treeCanopyRight];
  const lower = [G.treeCanopyLowerLeft, G.treeCanopyLowerCenter, G.treeCanopyLowerRight];
  for (let i = 0; i < 3; i++) {
    setTile("overhead", col + i, row, upper[i]!);
    setTile("props", col + i, row + 1, lower[i]!);
    block(col + i, row + 1, lower[i]!);
  }
  setTile("props", col + 1, row + 2, G.treeTrunk);
  block(col + 1, row + 2, G.treeTrunk);
  fillRect(col, row, 3, 3, (c, r) => { treeFootprint[index(c, r)] = 1; });
  return true;
};

// Border forest, leaving the gate niches to hedges.
for (let c = -1; c < WIDTH; c += 3) placeTree(c, -1); // top: crown row -1 is off-map, lower crown on row 0
for (let c = -1; c < WIDTH; c += 3) placeTree(c, HEIGHT - 3);
for (let r = 2; r < HEIGHT - 3; r += 3) { placeTree(-1, r); placeTree(WIDTH - 2, r); }

// Garden rooms: clustered trees framing the routes.
const clusters: [number, number][] = [
  [2, 7], [4, 9], [11, 4], [13, 7], [3, 15], [10, 16], [12, 19],
  [24, 5], [27, 8], [35, 9], [36, 15], [28, 17], [34, 20], [26, 23], [30, 25],
  [13, 23], [15, 26], [24, 26], [9, 27], [3, 27], [33, 27],
];
for (const [c, r] of clusters) placeTree(c, r);

// 6. Hedge on any still-open outer edge cell so the map has no exits.
fillRect(0, 0, WIDTH, HEIGHT, (c, r) => {
  const edge = c === 0 || r === 0 || c === WIDTH - 1 || r === HEIGHT - 1;
  if (!edge || layers.collision[index(c, r)] !== 0) return;
  setTile("props", c, r, G.hedge);
  block(c, r, G.hedge);
});

// 7. Fences: pond enclosure and a garden boundary, each with a two-tile opening.
const fenceH = (col: number, row: number, w: number, gap: [number, number] | null) => {
  for (let c = col; c < col + w; c++) {
    if (gap && c >= gap[0] && c <= gap[1]) continue;
    if (isReserved(c, row) || layers.collision[index(c, row)] !== 0) continue;
    const gid = c === col || c === col + w - 1 ? G.fencePost : G.fenceHorizontal;
    setTile("props", c, row, gid);
    block(c, row, gid);
  }
};
fenceH(2, 18, 10, [11, 11]); // north of the pond, open at the east end
fenceH(28, 21, 9, [31, 32]); // east garden, opening in the middle

// 8. Decoration after every reservation: torches beside gates, lanterns at the plaza,
//    shrubs and rocks on open grass, flowers on the detail layer.
for (const gate of GATES) {
  for (const c of [gate.col - 1, gate.col + gate.width]) {
    const r = gate.row + gate.height - 1;
    if (layers.collision[index(c, r)] !== 0) continue;
    setTile("props", c, r, G.torchA);
    block(c, r, G.torchA);
  }
}
for (const [c, r] of [[14, 9], [26, 9], [14, 21], [26, 21]] as const) {
  if (isReserved(c, r) || layers.collision[index(c, r)] !== 0) continue;
  setTile("props", c, r, G.lantern);
  block(c, r, G.lantern);
}
fillRect(1, 1, WIDTH - 2, HEIGHT - 2, (c, r) => {
  if (isReserved(c, r) || layers.collision[index(c, r)] !== 0 || treeFootprint[index(c, r)]) return;
  const v = (c * 23 + r * 41) % 53;
  if (v === 0) { setTile("props", c, r, G.shrub); block(c, r, G.shrub); }
  else if (v === 1) { setTile("props", c, r, G.rock); block(c, r, G.rock); }
});
fillRect(1, 1, WIDTH - 2, HEIGHT - 2, (c, r) => {
  if (isStone(c, r) || layers.collision[index(c, r)] !== 0 || treeFootprint[index(c, r)]) return;
  // Flowers may sit on reserved grass but never inside a gate approach or the spawn ring.
  const nearGate = GATES.some((g) => c >= g.col - 1 && c <= g.col + 3 && r >= g.row - 1 && r <= g.row + 5);
  if (nearGate) return;
  const v = (c * 13 + r * 7) % 31;
  if (v === 0) setTile("ground-detail", c, r, G.flowerOrange);
  else if (v === 1) setTile("ground-detail", c, r, G.flowerBlue);
});

// 9. Emit Tiled JSON.
const toTileLayer = (name: LayerName, data: number[], id: number) => ({
  id,
  name,
  type: "tilelayer",
  width: WIDTH,
  height: HEIGHT,
  x: 0,
  y: 0,
  opacity: 1,
  visible: true,
  data,
});
const map = {
  compressionlevel: -1,
  width: WIDTH,
  height: HEIGHT,
  tilewidth: TILE,
  tileheight: TILE,
  infinite: false,
  orientation: "orthogonal",
  renderorder: "right-down",
  type: "map",
  version: "1.10",
  tilesets: [
    {
      firstgid: 1,
      name: HUB_TILESET.name,
      image: HUB_TILESET.image,
      imagewidth: HUB_TILESET.width,
      imageheight: HUB_TILESET.height,
      tilewidth: TILE,
      tileheight: TILE,
      tilecount: HUB_TILESET.tileCount,
      columns: HUB_TILESET.columns,
      margin: 0,
      spacing: 0,
    },
  ],
  layers: [
    toTileLayer(HUB_LAYERS.ground, layers.ground, 1),
    toTileLayer(HUB_LAYERS.detail, layers["ground-detail"], 2),
    toTileLayer(HUB_LAYERS.props, layers.props, 3),
    toTileLayer(HUB_LAYERS.overhead, layers.overhead, 4),
    toTileLayer(HUB_LAYERS.collision, layers.collision, 5),
    {
      id: 6,
      name: HUB_LAYERS.markers,
      type: "objectgroup",
      x: 0,
      y: 0,
      opacity: 1,
      visible: true,
      objects: [
        { id: 1, name: "spawn", type: "", x: SPAWN.col * TILE + TILE / 2, y: SPAWN.row * TILE + TILE / 2, width: 0, height: 0, rotation: 0, visible: true, point: true },
        ...GATES.map((g, i) => ({
          id: 2 + i,
          name: "gate",
          type: "",
          x: g.col * TILE,
          y: g.row * TILE,
          width: g.width * TILE,
          height: g.height * TILE,
          rotation: 0,
          visible: true,
          properties: [{ name: "bossId", type: "string", value: g.bossId }],
        })),
      ],
    },
  ],
};

await Bun.write(OUT_PATH, `${JSON.stringify(map)}\n`);
console.log(`wrote ${fileURLToPath(OUT_PATH)}`);
