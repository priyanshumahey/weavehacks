import type Phaser from "phaser";

export function worldToAppPoint(
  scene: Phaser.Scene,
  worldX: number,
  worldY: number,
): { x: number; y: number } {
  const camera = scene.cameras.main;
  const scale = scene.game.scale;
  const canvas = scale.canvas;

  const screenX = (worldX - camera.scrollX) * camera.zoom;
  const screenY = (worldY - camera.scrollY) * camera.zoom;

  const bounds = scale.canvasBounds;

  return {
    x: bounds.x + (screenX / canvas.width) * bounds.width,
    y: bounds.y + (screenY / canvas.height) * bounds.height,
  };
}
