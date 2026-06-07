import Phaser from "phaser";
import { createGameConfig } from "./config";

export function createGame(): Phaser.Game {
  const game = new Phaser.Game(createGameConfig());

  // Expose for debugging in dev.
  (window as unknown as { __PHASER_GAME__?: Phaser.Game }).__PHASER_GAME__ = game;

  game.scale.on("resize", () => {
    const nextZoom = game.scale.getMaxZoom();

    if (nextZoom !== game.scale.zoom) {
      game.scale.setZoom(nextZoom);
    }
  });

  return game;
}
