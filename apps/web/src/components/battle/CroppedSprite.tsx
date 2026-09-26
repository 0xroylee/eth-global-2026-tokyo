/* eslint-disable @next/next/no-img-element -- art masters are static PNGs; no optimisation needed yet */

/**
 * CSS-crop of the 1254×1254 player master to the hub sprite's crop rect
 * (x330 y40 w600 h1010 — `HubScene.ts` `makeCroppedTexture` caller).
 *
 * Crop math: the displayed image is scaled by `1254 / 600` relative to the
 * container, so a horizontal offset of 330/600 of the container width shows
 * crop x=330. Percent `top` is relative to the container *height*
 * (W × 1010/600), so the y=40 offset is `40/1010` of the height.
 */
export function CroppedSprite({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative shrink-0 overflow-hidden ${className ?? ""}`}
      style={{ aspectRatio: "600 / 1010" }}
    >
      <img
        src="/images/player-you-master.png"
        alt=""
        className="absolute h-auto max-w-none [image-rendering:pixelated]"
        style={{
          width: "calc(100% * 1254 / 600)",
          left: "calc(100% * -330 / 600)",
          top: "calc(100% * -40 / 1010)",
        }}
      />
    </div>
  );
}
