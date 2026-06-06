import type Phaser from "phaser";

export function createWorldFrame(scene: Phaser.Scene): void {
  scene.cameras.main.setBackgroundColor("#10212b");
}
