import type Phaser from "phaser";

export interface MovementIntent {
  x: number;
  y: number;
}

export class WorldInputController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | null;

  constructor(scene: Phaser.Scene) {
    this.cursors = scene.input.keyboard?.createCursorKeys() ?? null;
  }

  readMovementIntent(): MovementIntent | null {
    if (!this.cursors) {
      return null;
    }

    let x = 0;
    let y = 0;

    if (this.cursors.left.isDown) {
      x -= 1;
    }

    if (this.cursors.right.isDown) {
      x += 1;
    }

    if (this.cursors.up.isDown) {
      y -= 1;
    }

    if (this.cursors.down.isDown) {
      y += 1;
    }

    if (x === 0 && y === 0) {
      return null;
    }

    return { x, y };
  }
}
