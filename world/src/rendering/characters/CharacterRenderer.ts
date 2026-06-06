import type Phaser from "phaser";
import { CharacterSprite } from "../../entities/CharacterSprite";
import { WorldRuntime } from "../../world/WorldRuntime";

export class CharacterRenderer {
  private readonly sprites = new Map<string, CharacterSprite>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldRuntime: WorldRuntime,
  ) {}

  create(): void {
    for (const character of Object.values(this.worldRuntime.getState().characters)) {
      const sprite = new CharacterSprite(this.scene, character);
      this.sprites.set(character.id, sprite);
    }
  }

  render(): void {
    for (const character of Object.values(this.worldRuntime.getState().characters)) {
      this.sprites.get(character.id)?.sync(character);
    }
  }
}
