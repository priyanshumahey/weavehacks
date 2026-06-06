import { createCharacterInstance } from "../../domain/characters/characterDefinition";
import { CharacterSprite } from "../../entities/CharacterSprite";
import type {
  CharacterDefinition,
  CharacterInstance,
  WorldBounds,
} from "../../types/character";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

interface CharacterManagerOptions {
  definitions: CharacterDefinition[];
  bounds: WorldBounds;
}

export class CharacterManager {
  private readonly bounds: WorldBounds;
  private readonly characters = new Map<string, CharacterInstance>();
  private readonly sprites = new Map<string, CharacterSprite>();

  constructor({ definitions, bounds }: CharacterManagerOptions) {
    this.bounds = bounds;

    for (const definition of definitions) {
      const instance = createCharacterInstance(definition);
      this.characters.set(instance.id, instance);
    }
  }

  spawnAll(scene: Phaser.Scene): void {
    for (const character of this.characters.values()) {
      const sprite = new CharacterSprite(scene, character);
      this.sprites.set(character.id, sprite);
    }
  }

  getCharacter(id: string): CharacterInstance | null {
    return this.characters.get(id) ?? null;
  }

  getPlayer(): CharacterInstance | null {
    for (const character of this.characters.values()) {
      if (character.kind === "player") {
        return character;
      }
    }

    return null;
  }

  getAll(): CharacterInstance[] {
    return Array.from(this.characters.values());
  }

  moveCharacter(id: string, deltaX: number, deltaY: number): void {
    const character = this.getCharacter(id);

    if (!character) {
      return;
    }

    const radius = character.appearance.radius;
    character.x = clamp(
      character.x + deltaX,
      this.bounds.minX + radius,
      this.bounds.maxX - radius,
    );
    character.y = clamp(
      character.y + deltaY,
      this.bounds.minY + radius,
      this.bounds.maxY - radius,
    );
  }

  syncSprites(): void {
    for (const character of this.characters.values()) {
      const sprite = this.sprites.get(character.id);

      if (sprite) {
        sprite.sync(character);
      }
    }
  }
}
