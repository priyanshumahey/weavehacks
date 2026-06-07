import { resolveCharacterSlotTopOffset } from "../characters/characterSpritesheet";
import type { CharacterState } from "../../world/worldState";

const LABEL_GAP_ABOVE_SPRITE = 10;

export function resolveCharacterLabelWorldPosition(
  character: CharacterState,
  labelHeight: number,
): { x: number; y: number } {
  const slotTopOffset = resolveCharacterSlotTopOffset(
    character.sprite.displayHeight,
    character.sprite.origin.y,
  );

  return {
    x: character.position.x + character.sprite.labelOffset.x,
    y:
      character.position.y -
      slotTopOffset -
      LABEL_GAP_ABOVE_SPRITE -
      labelHeight / 2,
  };
}
