import type Phaser from "phaser";
import { CharacterSprite } from "../../entities/CharacterSprite";
import { CharacterManager } from "../../runtime/characters/CharacterManager";

export class CharacterRenderer {
  private readonly sprites = new Map<string, CharacterSprite>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly characterManager: CharacterManager,
  ) {}

  create(): void {
    for (const character of this.characterManager.getAll()) {
      const sprite = new CharacterSprite(this.scene, character);
      this.sprites.set(character.id, sprite);
    }
  }

  render(): void {
    for (const character of this.characterManager.getAll()) {
      this.sprites.get(character.id)?.sync(character);
    }
  }
}
