import Phaser from "phaser";
import { ReplayScene } from "../scenes/ReplayScene";
import { WorldScene } from "../scenes/WorldScene";

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: "app",
    width: 960,
    height: 540,
    backgroundColor: "#10212b",
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      zoom: Phaser.Scale.MAX_ZOOM,
    },
    // ReplayScene boots first (the chronicle-playback experiment); WorldScene
    // remains registered for the interactive sandbox.
    scene: [ReplayScene, WorldScene],
  };
}
