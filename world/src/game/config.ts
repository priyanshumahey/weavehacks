import Phaser from "phaser";
import { WorldScene } from "../scenes/WorldScene";

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: "app",
    width: 960,
    height: 540,
    backgroundColor: "#10212b",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [WorldScene],
  };
}
