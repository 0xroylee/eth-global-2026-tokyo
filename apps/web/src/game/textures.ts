import type Phaser from "phaser";

/**
 * Procedural placeholder textures for the hub. Replace with painted art
 * (hub background, gate sprites, walking sheet) as exports land.
 */

function noiseTile(
  scene: Phaser.Scene,
  key: string,
  size: number,
  base: string,
  specks: { color: string; count: number; size: [number, number] }[],
  seed: number,
) {
  if (scene.textures.exists(key)) return;
  const canvas = scene.textures.createCanvas(key, size, size);
  if (!canvas) return;
  const ctx = canvas.context;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (const speck of specks) {
    ctx.fillStyle = speck.color;
    for (let i = 0; i < speck.count; i++) {
      const w = speck.size[0] + Math.floor(rand() * (speck.size[1] - speck.size[0] + 1));
      ctx.fillRect(Math.floor(rand() * size), Math.floor(rand() * size), w, w);
    }
  }
  canvas.refresh();
}

export function createGroundTextures(scene: Phaser.Scene) {
  noiseTile(scene, "tile-grass", 64, "#2f5a3a", [
    { color: "#356543", count: 40, size: [2, 4] },
    { color: "#274d31", count: 30, size: [2, 3] },
    { color: "#4a7d4e", count: 8, size: [1, 2] },
  ], 7);
  noiseTile(scene, "tile-path", 64, "#8d7a56", [
    { color: "#9d8a64", count: 30, size: [2, 4] },
    { color: "#7a6847", count: 24, size: [2, 3] },
    { color: "#b09c74", count: 6, size: [1, 2] },
  ], 11);
  noiseTile(scene, "tile-plaza", 64, "#5c5f6d", [
    { color: "#686b7a", count: 26, size: [3, 6] },
    { color: "#4f5260", count: 20, size: [2, 4] },
  ], 3);
}

/**
 * Downscale a region of a loaded image into a new texture. Used to strip the
 * embedded labels from art masters and size them for the hub.
 */
export function makeCroppedTexture(
  scene: Phaser.Scene,
  key: string,
  sourceKey: string,
  crop: { x: number; y: number; w: number; h: number },
  targetHeight: number,
) {
  if (scene.textures.exists(key)) return;
  const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const scale = targetHeight / crop.h;
  const w = Math.max(1, Math.round(crop.w * scale));
  const h = Math.max(1, Math.round(crop.h * scale));
  const canvas = scene.textures.createCanvas(key, w, h);
  if (!canvas) return;
  const ctx = canvas.context;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  canvas.refresh();
}
