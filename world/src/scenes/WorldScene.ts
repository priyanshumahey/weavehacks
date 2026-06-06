import Phaser from "phaser";
import { characterDefinitions } from "../data/characters";
import { CharacterManager } from "../runtime/characters/CharacterManager";
import type { WorldBounds } from "../types/character";

export class WorldScene extends Phaser.Scene {
  private characterManager: CharacterManager | null = null;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
  private worldBounds: WorldBounds | null = null;

  constructor() {
    super("world");
  }

  create(): void {
    const { width, height } = this.scale;
    const margin = 40;

    this.cameras.main.setBackgroundColor("#10212b");

    this.worldBounds = {
      minX: margin,
      minY: margin,
      maxX: width - margin,
      maxY: height - margin,
    };

    this.add
      .rectangle(width / 2, height / 2, width - 80, height - 80, 0x193441, 1)
      .setStrokeStyle(4, 0x4fc3a1, 1);

    this.add
      .text(width / 2, 72, "Weavehacks 2D World", {
        fontFamily: "Arial, sans-serif",
        fontSize: "32px",
        color: "#f4f1de",
      })
      .setOrigin(0.5);

    this.characterManager = new CharacterManager({
      definitions: characterDefinitions,
      bounds: this.worldBounds,
    });
    this.characterManager.spawnAll(this);

    this.cursors = this.input.keyboard?.createCursorKeys() ?? null;

    this.add
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

  update(_time: number, delta: number): void {
    if (!this.cursors || !this.characterManager) {
      return;
    }

    const player = this.characterManager.getPlayer();

    if (!player) {
      return;
    }

    const speed = (player.movement.speed * delta) / 1000;
    let deltaX = 0;
    let deltaY = 0;

    if (this.cursors.left.isDown) {
      deltaX -= speed;
    }

    if (this.cursors.right.isDown) {
      deltaX += speed;
    }

    if (this.cursors.up.isDown) {
      deltaY -= speed;
    }

    if (this.cursors.down.isDown) {
      deltaY += speed;
    }

    if (deltaX !== 0 || deltaY !== 0) {
      this.characterManager.moveCharacter(player.id, deltaX, deltaY);
    }

    this.characterManager.syncSprites();
  }
}
