import Phaser from "phaser";
import { ReplayScene } from "../scenes/ReplayScene";
import { WorldScene } from "../scenes/WorldScene";
import { EpisodeScene } from "../scenes/EpisodeScene";

export function createGameConfig(): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: "app",
    width: 960,
    height: 540,
    backgroundColor: "#000000",
    pixelArt: true,
    dom: {
      createContainer: true,
    },
    scale: {
      mode: Phaser.Scale.ENVELOP,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      zoom: Phaser.Scale.MAX_ZOOM,
    },
    // ReplayScene boots first (the chronicle-playback experiment); WorldScene
    // remains registered for the interactive sandbox. EpisodeScene plays the
    // continuous multi-map episode-script (launched from main.ts on ?script=).
    scene: [ReplayScene, WorldScene, EpisodeScene],
  };
}
