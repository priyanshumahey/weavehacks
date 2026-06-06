import { resolveFacingToward } from "../../domain/characters/resolveFacingToward";
import {
  CHARACTER_SPRITE_FACING,
  type CharacterSpriteFacing,
} from "../../types/characterSprite";
import type { WorldState } from "../worldState";

function isCharacterFacing(value: string): value is CharacterSpriteFacing {
  return Object.values(CHARACTER_SPRITE_FACING).includes(value as CharacterSpriteFacing);
}

function resolveEntityPosition(
  state: WorldState,
  entityId: string,
): { x: number; y: number } | null {
  const character = state.characters[entityId];

  if (character) {
    return character.position;
  }

  const entity = state.entities[entityId];

  return entity?.position ?? null;
}

export function applyFaceAction(
  state: WorldState,
  entityId: string,
  options: {
    facing?: CharacterSpriteFacing;
    targetEntityId?: string;
  },
): boolean {
  const character = state.characters[entityId];

  if (!character) {
    return false;
  }

  let facing = options.facing;

  if (options.targetEntityId) {
    const targetPosition = resolveEntityPosition(state, options.targetEntityId);

    if (!targetPosition) {
      return false;
    }

    facing = resolveFacingToward(character.position, targetPosition, character.facing);
  }

  if (!facing || !isCharacterFacing(facing)) {
    return false;
  }

  character.facing = facing;
  character.moveIntent = { x: 0, y: 0 };
  return true;
}
