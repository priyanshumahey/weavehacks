import type Phaser from "phaser";
import type { WorldBounds } from "../../world/worldState";

export function getWorldBounds(scene: Phaser.Scene): WorldBounds {
  const { width, height } = scene.scale;
  const margin = 40;

  return {
    minX: margin,
    minY: margin,
    maxX: width - margin,
    maxY: height - margin,
  };
}
