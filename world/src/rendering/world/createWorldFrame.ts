import type Phaser from "phaser";
import type { WorldBounds } from "../../world/worldState";

export function createWorldFrame(scene: Phaser.Scene, bounds: WorldBounds): void {
  const { width, height } = scene.scale;
  const frameWidth = bounds.maxX - bounds.minX;
  const frameHeight = bounds.maxY - bounds.minY;

  scene.cameras.main.setBackgroundColor("#10212b");

  scene.add
    .rectangle(
      bounds.minX + frameWidth / 2,
      bounds.minY + frameHeight / 2,
      frameWidth,
      frameHeight,
      0x193441,
      1,
    )
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
}
