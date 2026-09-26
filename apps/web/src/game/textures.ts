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

  // Phase 1: smooth downscale of the crop into a 2x intermediate canvas so
  // high-frequency detail survives; Phase 2 below bakes the hard pixel edges.
  const midW = w * 2;
  const midH = h * 2;
  const mid = document.createElement("canvas");
  mid.width = midW;
  mid.height = midH;
  const midCtx = mid.getContext("2d");
  if (!midCtx) return;
  midCtx.imageSmoothingEnabled = true;
  midCtx.imageSmoothingQuality = "high";
  midCtx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, midW, midH);

  // Phase 2: nearest-neighbor downscale from the intermediate to the final
  // canvas, producing crisp stepped edges instead of baked-in blur.
  const canvas = scene.textures.createCanvas(key, w, h);
  if (!canvas) return;
  const ctx = canvas.context;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mid, 0, 0, midW, midH, 0, 0, w, h);
  canvas.refresh();
}
