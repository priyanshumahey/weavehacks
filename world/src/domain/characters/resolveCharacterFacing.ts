import {
  CHARACTER_SPRITE_ANIMATION_KEYS,
  CHARACTER_SPRITE_FACING,
  type CharacterSpriteAnimationKey,
  type CharacterSpriteFacing,
} from "../../types/characterSprite";
import type { Vector2 } from "../../world/worldState";

const MOVEMENT_EPSILON = 0.001;

export function resolveCharacterFacing(
  moveIntent: Vector2,
  currentFacing: CharacterSpriteFacing = CHARACTER_SPRITE_FACING.down,
): CharacterSpriteFacing {
  const { x, y } = moveIntent;

  if (Math.abs(x) < MOVEMENT_EPSILON && Math.abs(y) < MOVEMENT_EPSILON) {
    return currentFacing;
  }

  if (Math.abs(x) >= Math.abs(y)) {
    return x < 0 ? CHARACTER_SPRITE_FACING.left : CHARACTER_SPRITE_FACING.right;
  }

  return y < 0 ? CHARACTER_SPRITE_FACING.up : CHARACTER_SPRITE_FACING.down;
}

export function resolveCharacterAnimation(moveIntent: Vector2): CharacterSpriteAnimationKey {
  const isMoving =
    Math.abs(moveIntent.x) >= MOVEMENT_EPSILON || Math.abs(moveIntent.y) >= MOVEMENT_EPSILON;

  return isMoving
    ? CHARACTER_SPRITE_ANIMATION_KEYS.walk
    : CHARACTER_SPRITE_ANIMATION_KEYS.idle;
}
