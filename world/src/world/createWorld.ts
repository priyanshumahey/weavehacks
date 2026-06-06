import { createCharacterInstance } from "../domain/characters/characterDefinition";
import type { CharacterDefinition, WorldBounds } from "../types/character";
import { CHARACTER_CONTROLLER_TYPES, ENTITY_KINDS } from "./worldState";
import type { CharacterState, WorldState } from "./worldState";

interface CreateWorldOptions {
  bounds: WorldBounds;
  definitions: CharacterDefinition[];
  seed?: string;
}

function toCharacterState(definition: CharacterDefinition): CharacterState {
  const instance = createCharacterInstance(definition);

  return {
    id: instance.id,
    kind: ENTITY_KINDS.character,
    name: instance.name,
    position: {
      x: instance.x,
      y: instance.y,
    },
    tags: instance.tags,
    traits: instance.traits,
    zoneId: instance.zoneId,
    blocksMovement: instance.blocksMovement,
    interactable: instance.interactable,
    characterKind: instance.kind,
    controller: instance.controller,
    appearance: instance.appearance,
    sprite: instance.sprite,
    movement: instance.movement,
    velocity: instance.velocity,
    moveIntent: instance.moveIntent,
    dialogueId: instance.dialogueId,
  };
}

export function createWorld({
  bounds,
  definitions,
  seed = "prototype-world",
}: CreateWorldOptions): WorldState {
  const characters = definitions.reduce<Record<string, CharacterState>>((all, definition) => {
    const character = toCharacterState(definition);
    all[character.id] = character;
    return all;
  }, {});

  let playerId: string | null = null;

  for (const character of Object.values(characters)) {
    if (character.controller === CHARACTER_CONTROLLER_TYPES.player) {
      playerId = character.id;
      break;
    }
  }

  return {
    seed,
    bounds,
    playerId,
    characters,
    entities: {},
    zones: {},
    ui: {
      prompt: null,
      dialogue: null,
      inspection: null,
      selectedEntityId: playerId,
    },
    time: {
      elapsedMs: 0,
      tick: 0,
      timeScale: 1,
    },
  };
}
