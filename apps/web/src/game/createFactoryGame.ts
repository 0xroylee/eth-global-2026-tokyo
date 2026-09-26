import Phaser from "phaser";
import { FactoryScene, type FactoryHooks } from "./FactoryScene";

/** Boots the walkable factory. Browser-only; import dynamically. */
export function createFactoryGame(parent: HTMLElement, hooks: FactoryHooks): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: Math.max(1, parent.clientWidth),
    height: Math.max(1, parent.clientHeight),
    backgroundColor: "#1a1612",
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
  game.scene.add("factory", FactoryScene, true, { hooks });
  return game;
}
