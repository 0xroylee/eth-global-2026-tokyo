import Phaser from "phaser";
import type { GameBridge } from "./bridge";
import { HubScene } from "./HubScene";

/** Boots the Phaser game into `parent`. Browser-only; import dynamically. */
export function createGame(parent: HTMLElement, bridge: GameBridge): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.max(1, parent.clientWidth),
    height: Math.max(1, parent.clientHeight),
    backgroundColor: "#080b14",
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      autoRound: true,
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
