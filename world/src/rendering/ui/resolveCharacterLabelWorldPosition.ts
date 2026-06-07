import { resolveCharacterSlotTopOffset } from "../characters/characterSpritesheet";
import type { CharacterState } from "../../world/worldState";

const LABEL_GAP_ABOVE_SPRITE = 10;
const LABEL_GAP_BELOW_SPRITE = 6;

export type CharacterLabelPlacement = "above" | "below";

export function resolveCharacterLabelWorldPosition(
  character: CharacterState,
  placement: CharacterLabelPlacement = "above",
): { x: number; y: number } {
  const x = character.position.x + character.sprite.labelOffset.x;

  if (placement === "below") {
    const feetOffset =
      character.sprite.displayHeight * (1 - character.sprite.origin.y);

    return {
      x,
      y: character.position.y + feetOffset + LABEL_GAP_BELOW_SPRITE,
    };
  }

  const slotTopOffset = resolveCharacterSlotTopOffset(
    character.sprite.displayHeight,
    character.sprite.origin.y,
  );

  return {
    x,
    y: character.position.y - slotTopOffset - LABEL_GAP_ABOVE_SPRITE,
  };
}
