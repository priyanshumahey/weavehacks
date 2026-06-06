import {
  CHARACTER_SPRITE_FACING,
  type CharacterSpriteFacing,
} from "../../types/characterSprite";
import type { Vector2 } from "../../world/worldState";

const MOVEMENT_EPSILON = 0.001;

export function resolveCharacterFacing(
  moveIntent: Vector2,
  lastFacing: CharacterSpriteFacing = CHARACTER_SPRITE_FACING.down,
): CharacterSpriteFacing {
  const { x, y } = moveIntent;

  if (Math.abs(x) < MOVEMENT_EPSILON && Math.abs(y) < MOVEMENT_EPSILON) {
    return lastFacing;
  }

  if (Math.abs(x) >= Math.abs(y)) {
    return x < 0 ? CHARACTER_SPRITE_FACING.left : CHARACTER_SPRITE_FACING.right;
  }

  return y < 0 ? CHARACTER_SPRITE_FACING.up : CHARACTER_SPRITE_FACING.down;
}

export function isCharacterMoving(moveIntent: Vector2): boolean {
  return (
    Math.abs(moveIntent.x) >= MOVEMENT_EPSILON || Math.abs(moveIntent.y) >= MOVEMENT_EPSILON
  );
}
