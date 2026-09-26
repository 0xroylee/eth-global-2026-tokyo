import type Phaser from "phaser";

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
