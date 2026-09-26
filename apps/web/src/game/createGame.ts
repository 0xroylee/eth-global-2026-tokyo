import Phaser from "phaser";
import type { GameBridge } from "./bridge";
import { HubScene } from "./HubScene";

export const VIEWPORT = { width: 960, height: 600 } as const;

/** Boots the Phaser game into `parent`. Browser-only; import dynamically. */
export function createGame(parent: HTMLElement, bridge: GameBridge): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    backgroundColor: "#080b14",
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
    scene: [],
  });
  game.scene.add("hub", HubScene, true, { bridge });
  return game;
}
