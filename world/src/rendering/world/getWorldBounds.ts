import type Phaser from "phaser";
import type { WorldBounds } from "../../world/worldState";

const WORLD_PLAYFIELD_MARGIN = 40;

export function getWorldBounds(scene: Phaser.Scene): WorldBounds {
  const camera = scene.cameras.main;
  const margin = WORLD_PLAYFIELD_MARGIN;

  return {
    minX: margin,
    minY: margin,
    maxX: camera.width - margin,
    maxY: camera.height - margin,
  };
}
