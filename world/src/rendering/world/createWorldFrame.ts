import type Phaser from "phaser";
import type { WorldBounds } from "../../types/character";

export interface WorldFrame {
  bounds: WorldBounds;
}

export function createWorldFrame(scene: Phaser.Scene): WorldFrame {
  const { width, height } = scene.scale;
  const margin = 40;
  const bounds = {
    minX: margin,
    minY: margin,
    maxX: width - margin,
    maxY: height - margin,
  };

  scene.cameras.main.setBackgroundColor("#10212b");

  scene.add
    .rectangle(width / 2, height / 2, width - 80, height - 80, 0x193441, 1)
    .setStrokeStyle(4, 0x4fc3a1, 1);

  scene.add
    .text(width / 2, 72, "Weavehacks 2D World", {
      fontFamily: "Arial, sans-serif",
      fontSize: "32px",
      color: "#f4f1de",
    })
    .setOrigin(0.5);

  scene.add
    .text(
      width / 2,
      height - 56,
      "Use arrow keys to move the player. NPCs are file-backed character definitions.",
      {
        fontFamily: "Arial, sans-serif",
        fontSize: "18px",
        color: "#b8d8d8",
      },
    )
    .setOrigin(0.5);

  return { bounds };
}
