// Structural and reachability check for public/game/hub.json.
// Run from apps/web: bun run map:check
import { HUB_LAYERS, HUB_TILESET } from "../src/game/hubTiles";

const WIDTH = 40;
const HEIGHT = 30;
const MAP_PATH = new URL("../public/game/hub.json", import.meta.url);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type TileLayer = { type: "tilelayer"; name: string; width: number; height: number; data: number[] };
type TiledObject = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  properties?: { name: string; value: unknown }[];
};
type ObjectLayer = { type: "objectgroup"; name: string; objects: TiledObject[] };
type TiledMap = {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  tilesets: { name: string; image: string; imagewidth: number; imageheight: number; columns: number; tilecount: number; firstgid: number }[];
  layers: (TileLayer | ObjectLayer)[];
};

const map = (await Bun.file(MAP_PATH).json()) as TiledMap;

// Map and tileset metadata
assert(map.width === WIDTH && map.height === HEIGHT, `map must be ${WIDTH}x${HEIGHT}, got ${map.width}x${map.height}`);
assert(map.tilewidth === HUB_TILESET.tileSize && map.tileheight === HUB_TILESET.tileSize, "tiles must be 16x16");
assert(map.tilesets.length === 1, "map must use exactly one tileset");
const tileset = map.tilesets[0]!;
assert(tileset.name === HUB_TILESET.name, `tileset name must be ${HUB_TILESET.name}`);
assert(tileset.image === HUB_TILESET.image, `tileset image must be ${HUB_TILESET.image}`);
assert(tileset.imagewidth === HUB_TILESET.width && tileset.imageheight === HUB_TILESET.height, `tileset image must be ${HUB_TILESET.width}x${HUB_TILESET.height}`);
assert(tileset.columns === HUB_TILESET.columns, `tileset must have ${HUB_TILESET.columns} columns`);
assert(tileset.tilecount === HUB_TILESET.tileCount, `tileset must have ${HUB_TILESET.tileCount} tiles`);
assert(tileset.firstgid === 1, "tileset firstgid must be 1");

// Tile layers in order, each 1200 integers within the atlas
const expectedTileLayers = [HUB_LAYERS.ground, HUB_LAYERS.detail, HUB_LAYERS.props, HUB_LAYERS.overhead, HUB_LAYERS.collision];
const tileLayers = map.layers.filter((l): l is TileLayer => l.type === "tilelayer");
assert(
  tileLayers.map((l) => l.name).join(",") === expectedTileLayers.join(","),
  `tile layers must be [${expectedTileLayers.join(", ")}], got [${tileLayers.map((l) => l.name).join(", ")}]`,
);
for (const layer of tileLayers) {
  assert(layer.data.length === WIDTH * HEIGHT, `${layer.name} must have ${WIDTH * HEIGHT} cells, got ${layer.data.length}`);
  for (const [i, gid] of layer.data.entries()) {
    assert(Number.isInteger(gid) && gid >= 0 && gid <= HUB_TILESET.tileCount, `${layer.name}[${i}] gid ${gid} is outside 0..${HUB_TILESET.tileCount}`);
  }
}

// Markers
const objectLayers = map.layers.filter((l): l is ObjectLayer => l.type === "objectgroup");
assert(objectLayers.length === 1 && objectLayers[0]!.name === HUB_LAYERS.markers, `map must have one object layer named ${HUB_LAYERS.markers}`);
const markers = objectLayers[0]!;
const spawns = markers.objects.filter((o) => o.name === "spawn");
assert(spawns.length === 1 && spawns[0]!.point === true, "markers must contain exactly one point named spawn");
const gates = markers.objects.filter((o) => o.name === "gate");
assert(gates.length === 3, `markers must contain three gates, got ${gates.length}`);
const bossIds = gates
  .map((g) => g.properties?.find((p) => p.name === "bossId")?.value)
  .sort();
assert(bossIds.join(",") === "cat,locked,macro-whale", `gate bossIds must be cat, locked, macro-whale; got ${bossIds.join(",")}`);
for (const gate of gates) assert(gate.width > 0 && gate.height > 0 && !gate.point, "gates must be rectangles");
const exits = markers.objects.filter((o) => o.name === "region-exit");
assert(exits.length === 1, `markers must contain one region-exit, got ${exits.length}`);
const regionExit = exits[0]!;
const exitId = regionExit.properties?.find((p) => p.name === "exitId")?.value;
const exitStatus = regionExit.properties?.find((p) => p.name === "status")?.value;
assert(exitId === "east-route", `region-exit exitId must be east-route, got ${String(exitId)}`);
assert(exitStatus === "coming-soon", `region-exit status must be coming-soon, got ${String(exitStatus)}`);
assert(regionExit.width === HUB_TILESET.tileSize && regionExit.height === HUB_TILESET.tileSize * 3, "region-exit must cover the three barrier tiles");

// Collision grid and reachability
const collision = tileLayers.find((l) => l.name === HUB_LAYERS.collision)!;
const blocked = (col: number, row: number) => collision.data[row * WIDTH + col]! !== 0;
const toTile = (px: number, py: number) => ({ col: Math.floor(px / HUB_TILESET.tileSize), row: Math.floor(py / HUB_TILESET.tileSize) });

const spawn = toTile(spawns[0]!.x, spawns[0]!.y);
assert(!blocked(spawn.col, spawn.row), `spawn tile ${spawn.col},${spawn.row} is blocked`);

// The approach is the tile row directly below the gate rectangle, centred on it.
const approaches = gates.map((g) => {
  const bossId = String(g.properties?.find((p) => p.name === "bossId")?.value);
  const tile = toTile(g.x + g.width / 2, g.y + g.height + HUB_TILESET.tileSize / 2);
  return { bossId, ...tile };
});
for (const a of approaches) assert(!blocked(a.col, a.row), `${a.bossId} gate approach ${a.col},${a.row} is blocked`);

const reachable = new Uint8Array(WIDTH * HEIGHT);
const queue: number[] = [spawn.row * WIDTH + spawn.col];
reachable[queue[0]!] = 1;
while (queue.length) {
  const idx = queue.shift()!;
  const col = idx % WIDTH;
  const row = Math.floor(idx / WIDTH);
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const c = col + dc;
    const r = row + dr;
    if (c < 0 || r < 0 || c >= WIDTH || r >= HEIGHT) continue;
    const n = r * WIDTH + c;
    if (reachable[n] || blocked(c, r)) continue;
    reachable[n] = 1;
    queue.push(n);
  }
}
for (const a of approaches) assert(reachable[a.row * WIDTH + a.col], `${a.bossId} gate is not reachable from spawn`);

const barrier = toTile(regionExit.x, regionExit.y);
for (let row = barrier.row; row < barrier.row + 3; row++) {
  assert(blocked(barrier.col, row), `region-exit barrier ${barrier.col},${row} must stay blocked`);
}
assert(reachable[13 * WIDTH + 36], "region-exit approach center 36,13 is not reachable from spawn");

// Outer edge is fully blocked
for (let col = 0; col < WIDTH; col++) {
  assert(blocked(col, 0) && blocked(col, HEIGHT - 1), `outer edge column ${col} is not blocked`);
}
for (let row = 0; row < HEIGHT; row++) {
  assert(blocked(0, row) && blocked(WIDTH - 1, row), `outer edge row ${row} is not blocked`);
}

// Pond interior is blocked: every water tile on the ground layer that has water on all four sides.
const ground = tileLayers.find((l) => l.name === HUB_LAYERS.ground)!;
const waterGids = new Set<number>([
  HUB_TILESET.gid.waterA,
  HUB_TILESET.gid.waterB,
  HUB_TILESET.gid.waterEdgeN,
  HUB_TILESET.gid.waterEdgeE,
  HUB_TILESET.gid.waterEdgeS,
  HUB_TILESET.gid.waterEdgeW,
  HUB_TILESET.gid.waterCorner,
  HUB_TILESET.gid.waterCornerNE,
  HUB_TILESET.gid.waterCornerSW,
  HUB_TILESET.gid.waterCornerSE,
]);
const isWater = (col: number, row: number) => col >= 0 && row >= 0 && col < WIDTH && row < HEIGHT && waterGids.has(ground.data[row * WIDTH + col]!);
let waterCells = 0;
for (let row = 0; row < HEIGHT; row++) {
  for (let col = 0; col < WIDTH; col++) {
    if (!isWater(col, row)) continue;
    waterCells++;
    const interior = isWater(col + 1, row) && isWater(col - 1, row) && isWater(col, row + 1) && isWater(col, row - 1);
    if (interior) assert(blocked(col, row), `pond interior ${col},${row} is walkable`);
  }
}
assert(waterCells >= 4, "map must contain a pond of at least 2x2 water tiles");

console.log("hub map check passed");
