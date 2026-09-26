import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function png(width, height, rgba) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function canvas(width, height) {
  const data = Buffer.alloc(width * height * 4);
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= width || y >= height || !color) return;
    const i = (y * width + x) * 4;
    data[i] = color[0];
    data[i + 1] = color[1];
    data[i + 2] = color[2];
    data[i + 3] = color[3] ?? 255;
  };
  const fill = (x, y, w, h, color) => {
    for (let yy = 0; yy < h; yy += 1) for (let xx = 0; xx < w; xx += 1) set(x + xx, y + yy, color);
  };
  return { data, set, fill };
}

const C = {
  floor: [62, 56, 50],
  floorDark: [48, 44, 40],
  worn: [86, 76, 64],
  mat: [92, 58, 34],
  matEdge: [58, 36, 22],
  wall: [36, 30, 28],
  brick: [58, 46, 40],
  mortar: [28, 24, 22],
  trim: [92, 64, 42],
  iron: [176, 180, 188],
  ironDark: [96, 100, 110],
  wood: [120, 74, 40],
  woodDark: [74, 46, 26],
  ember: [255, 132, 42],
  emberHot: [255, 214, 120],
  coal: [28, 26, 28],
  coalHi: [58, 54, 56],
  skin: [236, 196, 158],
  hair: [42, 28, 22],
  beard: [78, 50, 32],
  apron: [142, 78, 42],
  apronDark: [96, 50, 28],
  shirt: [58, 62, 78],
  boot: [36, 28, 26],
  handle: [110, 68, 36],
};

function tileOf(paint) {
  const board = canvas(16, 16);
  paint(board);
  return board.data;
}

const tiles = [
  (b) => {
    b.fill(0, 0, 16, 16, C.floor);
  },
  (b) => {
    b.fill(0, 0, 16, 16, C.floor);
    b.fill(2, 4, 8, 5, C.worn);
    b.fill(4, 6, 4, 2, C.floorDark);
  },
  (b) => {
    b.fill(0, 0, 16, 16, C.matEdge);
    b.fill(1, 1, 14, 14, C.mat);
    b.fill(2, 2, 12, 12, [110, 72, 42]);
  },
  (b) => {
    b.fill(0, 0, 16, 16, C.wall);
    b.fill(0, 14, 16, 2, C.trim);
  },
  (b) => {
    b.fill(0, 0, 16, 16, C.mortar);
    b.fill(1, 1, 6, 6, C.brick);
    b.fill(9, 1, 6, 6, C.brick);
    b.fill(1, 9, 6, 6, C.brick);
    b.fill(9, 9, 6, 6, C.brick);
  },
  (b) => {
    b.fill(0, 0, 16, 16, C.brick);
    b.fill(0, 12, 16, 4, C.wall);
    b.fill(0, 12, 16, 1, C.trim);
  },
  (b) => {
    b.fill(0, 0, 16, 16, C.floor);
    b.fill(1, 2, 14, 13, C.wall);
    b.fill(2, 3, 12, 10, C.mortar);
    b.fill(4, 5, 8, 6, C.ember);
    b.fill(6, 7, 4, 3, C.emberHot);
    b.fill(1, 13, 14, 2, C.ironDark);
  },
  (b) => {
    b.fill(3, 4, 10, 8, C.ember);
    b.fill(5, 6, 6, 4, C.emberHot);
    b.set(4, 5, C.emberHot);
    b.set(11, 8, C.ember);
  },
  (b) => {
    b.fill(1, 6, 10, 4, C.iron);
    b.fill(8, 5, 6, 3, C.iron);
    b.fill(2, 10, 4, 4, C.ironDark);
    b.fill(10, 10, 3, 4, C.ironDark);
    b.fill(1, 6, 10, 1, C.ironDark);
  },
  (b) => {
    b.fill(0, 6, 16, 3, C.wood);
    b.fill(0, 6, 16, 1, C.woodDark);
    b.fill(2, 9, 2, 6, C.woodDark);
    b.fill(12, 9, 2, 6, C.woodDark);
    b.fill(6, 3, 5, 3, C.iron);
  },
  (b) => {
    b.fill(2, 4, 12, 10, C.wood);
    b.fill(2, 4, 12, 2, C.woodDark);
    b.fill(3, 8, 10, 1, C.woodDark);
    b.fill(4, 14, 3, 2, C.woodDark);
    b.fill(9, 14, 3, 2, C.woodDark);
  },
  (b) => {
    b.fill(3, 8, 10, 4, C.iron);
    b.fill(4, 5, 8, 3, C.ironDark);
    b.fill(5, 3, 6, 2, [210, 170, 70]);
    b.set(6, 9, C.ironDark);
    b.set(9, 10, C.ironDark);
  },
  (b) => {
    b.fill(3, 8, 4, 4, C.coal);
    b.fill(7, 10, 5, 3, C.coal);
    b.fill(5, 6, 4, 3, C.coalHi);
    b.set(4, 9, C.coalHi);
    b.set(9, 11, C.coalHi);
  },
  (b) => {
    b.fill(2, 3, 2, 12, C.woodDark);
    b.fill(12, 3, 2, 12, C.woodDark);
    b.fill(2, 6, 12, 1, C.wood);
    b.fill(2, 11, 12, 1, C.wood);
    b.fill(5, 4, 1, 6, C.iron);
    b.fill(8, 5, 1, 5, C.ironDark);
    b.fill(10, 4, 1, 7, [180, 140, 60]);
  },
  (b) => {
    b.fill(7, 2, 2, 12, C.woodDark);
    b.fill(4, 3, 8, 2, C.iron);
    b.fill(5, 2, 6, 1, C.ironDark);
    b.fill(6, 5, 4, 1, [180, 140, 60]);
  },
  (b) => {
    b.fill(0, 0, 16, 16, C.wall);
    b.fill(5, 0, 6, 16, C.brick);
  },
];

const sheet = canvas(128, 32);
tiles.forEach((paint, index) => {
  const tile = tileOf(paint);
  const ox = (index % 8) * 16;
  const oy = Math.floor(index / 8) * 16;
  for (let y = 0; y < 16; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const from = (y * 16 + x) * 4;
      const to = ((oy + y) * 128 + ox + x) * 4;
      sheet.data[to] = tile[from];
      sheet.data[to + 1] = tile[from + 1];
      sheet.data[to + 2] = tile[from + 2];
      sheet.data[to + 3] = tile[from + 3] || 255;
    }
  }
});

function smithFrame(frame) {
  const board = canvas(32, 32);
  const { fill, set } = board;
  fill(10, 28, 5, 3, C.boot);
  fill(17, 28, 5, 3, C.boot);
  fill(11, 22, 4, 6, C.apronDark);
  fill(17, 22, 4, 6, C.apronDark);
  fill(9, 16, 14, 8, C.apron);
  fill(9, 16, 14, 2, C.apronDark);
  fill(15, 18, 2, 6, C.apronDark);
  fill(6, 17, 3, 5, C.shirt);
  fill(23, 17, 3, 5, C.shirt);
  fill(11, 8, 10, 8, C.skin);
  fill(11, 7, 10, 2, C.hair);
  fill(10, 9, 2, 5, C.hair);
  fill(20, 9, 2, 4, C.hair);
  fill(13, 11, 2, 2, C.hair);
  fill(17, 11, 2, 2, C.hair);
  fill(12, 15, 8, 3, C.beard);
  set(14, 14, C.hair);
  if (frame === 0) {
    fill(22, 12, 2, 8, C.handle);
    fill(20, 10, 6, 3, C.iron);
    fill(20, 10, 6, 1, C.ironDark);
  } else if (frame === 1) {
    fill(14, 2, 2, 7, C.handle);
    fill(11, 1, 8, 3, C.iron);
    fill(11, 1, 8, 1, C.ironDark);
    fill(22, 14, 3, 3, C.shirt);
  } else {
    fill(18, 20, 2, 6, C.handle);
    fill(15, 24, 8, 3, C.iron);
    fill(15, 26, 8, 1, C.ironDark);
    set(14, 25, C.emberHot);
    set(23, 24, C.ember);
  }
  return board.data;
}

const smith = canvas(96, 32);
for (let frame = 0; frame < 3; frame += 1) {
  const part = smithFrame(frame);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const from = (y * 32 + x) * 4;
      const to = (y * 96 + frame * 32 + x) * 4;
      smith.data[to] = part[from];
      smith.data[to + 1] = part[from + 1];
      smith.data[to + 2] = part[from + 2];
      smith.data[to + 3] = part[from + 3];
    }
  }
}

const root = new URL("../public/game/", import.meta.url);
writeFileSync(new URL("workshop-tiles.png", root), png(128, 32, sheet.data));
writeFileSync(new URL("blacksmith.png", root), png(96, 32, smith.data));
writeFileSync(new URL("workshop-glow.png", root), png(16, 16, tileOf(tiles[7])));
