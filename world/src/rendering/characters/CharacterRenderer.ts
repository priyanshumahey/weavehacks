import type Phaser from "phaser";
import { CharacterSprite } from "../../entities/CharacterSprite";
import type { WorldState } from "../../world/worldState";

export class CharacterRenderer {
  private readonly sprites = new Map<string, CharacterSprite>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(state: WorldState): void {
    const activeCharacterIds = new Set(Object.keys(state.characters));

    for (const [characterId, sprite] of this.sprites) {
      if (activeCharacterIds.has(characterId)) {
        continue;
      }

      sprite.destroy();
      this.sprites.delete(characterId);
    }

    for (const character of Object.values(state.characters)) {
      let sprite = this.sprites.get(character.id);

      if (!sprite) {
        sprite = new CharacterSprite(this.scene, character);
        this.sprites.set(character.id, sprite);
      }

      sprite.sync(character, state.ui.selectedEntityId === character.id);
    }
  }
}
