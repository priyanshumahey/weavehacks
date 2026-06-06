import {
  CHARACTER_SPRITE_FACING,
  type CharacterSpriteFacing,
} from "../../types/characterSprite";
import type { Vector2 } from "../../world/worldState";

const MOVEMENT_EPSILON = 0.001;

export function resolveFacingToward(
  source: Vector2,
  target: Vector2,
  currentFacing: CharacterSpriteFacing = CHARACTER_SPRITE_FACING.down,
): CharacterSpriteFacing {
  const x = target.x - source.x;
  const y = target.y - source.y;

  if (Math.abs(x) < MOVEMENT_EPSILON && Math.abs(y) < MOVEMENT_EPSILON) {
    return currentFacing;
  }

  if (Math.abs(x) >= Math.abs(y)) {
    return x < 0 ? CHARACTER_SPRITE_FACING.left : CHARACTER_SPRITE_FACING.right;
  }

  return y < 0 ? CHARACTER_SPRITE_FACING.up : CHARACTER_SPRITE_FACING.down;
}
