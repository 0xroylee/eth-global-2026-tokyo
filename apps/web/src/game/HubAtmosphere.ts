import Phaser from "phaser";
import { HUB_LAYERS, HUB_TILESET } from "./hubTiles";

/** Bounded decorative objects; scene ownership handles destruction on shutdown. */
export class HubAtmosphere {
  private motes: { sprite: Phaser.GameObjects.Rectangle; x: number; y: number; phase: number }[] = [];
  private lights: Phaser.GameObjects.Arc[] = [];

  constructor(scene: Phaser.Scene, map: Phaser.Tilemaps.Tilemap) {
    const lightGids = new Set<number>([
      HUB_TILESET.gid.torchA,
      HUB_TILESET.gid.torchB,
      HUB_TILESET.gid.torchC,
      HUB_TILESET.gid.lantern,
    ]);
    const props = map.getLayer(HUB_LAYERS.props);
    for (const row of props?.data ?? []) {
      for (const tile of row) {
        if (!tile || tile.index <= 0 || !lightGids.has(tile.index)) continue;
        // Above ground detail, below props, characters, and overhead foliage.
        this.lights.push(scene.add.circle(tile.pixelX + 8, tile.pixelY + 6, 15, 0xffbf55, 0.1).setDepth(1.5));
      }
    }
    for (let i = 0; i < 24; i++) {
      const x = 24 + (i * 137) % (map.widthInPixels - 48);
      const y = 24 + (i * 89) % (map.heightInPixels - 48);
      this.motes.push({
        // Above props, below y-sorted characters and gate labels.
        sprite: scene.add.rectangle(x, y, 1, 1, 0xffeaa0, 0).setDepth(4),
        x, y, phase: i * 2.399,
      });
    }
  }

  update(time: number, reducedMotion: boolean) {
    for (const mote of this.motes) {
      mote.sprite.setVisible(!reducedMotion);
      if (reducedMotion) continue;
      const phase = time / 2400 + mote.phase;
      mote.sprite.setPosition(mote.x + Math.sin(phase) * 7, mote.y + Math.cos(phase * 0.7) * 5);
      mote.sprite.setAlpha(Math.max(0, Math.sin(phase * 1.3)) * 0.65);
    }
    this.lights.forEach((light, index) => {
      light.setAlpha(reducedMotion ? 0.1 : 0.1 + Math.sin(time / 420 + index * 1.7) * 0.025);
    });
  }
}
