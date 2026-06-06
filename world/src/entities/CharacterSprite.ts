import Phaser from "phaser";
import type { CharacterInstance } from "../types/character";

export class CharacterSprite extends Phaser.GameObjects.Container {
  private readonly bodyCircle: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  readonly characterId: string;

  constructor(scene: Phaser.Scene, character: CharacterInstance) {
    super(scene, character.x, character.y);

    this.characterId = character.id;

    this.bodyCircle = scene.add.circle(
      0,
      0,
      character.appearance.radius,
      Phaser.Display.Color.HexStringToColor(character.appearance.color).color,
    );

    this.label = scene.add
      .text(0, character.appearance.radius + 14, character.name, {
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        color: character.appearance.labelColor,
      })
      .setOrigin(0.5, 0);

    this.add([this.bodyCircle, this.label]);
    scene.add.existing(this);
  }

  sync(character: CharacterInstance): void {
    this.setPosition(character.x, character.y);
  }
}
