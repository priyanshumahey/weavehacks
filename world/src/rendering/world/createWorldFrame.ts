import type Phaser from "phaser";
import { WORLD_HEIGHT, WORLD_WIDTH } from "./worldDimensions";

export function createWorldFrame(scene: Phaser.Scene): void {
  scene.cameras.main.setBackgroundColor("#10212b");
}

export function setupWorldCamera(
  scene: Phaser.Scene,
  followTarget: Phaser.GameObjects.GameObject,
): void {
  const camera = scene.cameras.main;

  camera.setBackgroundColor("#10212b");
  camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  camera.startFollow(followTarget, true);
}
