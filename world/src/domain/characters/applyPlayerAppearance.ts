import {
  buildPlayerAppearanceSpriteDefinition,
  getPlayerAppearanceOption,
} from "../../data/characters/playerAppearances";
import { normalizeCharacterSprite } from "./characterSprite";
import type { WorldState } from "../../world/worldState";
import { CHARACTER_CONTROLLER_TYPES } from "../../world/worldState";

export function applyPlayerAppearanceSystem(
  state: WorldState,
  entityId: string,
  appearanceId: string,
): boolean {
  const character = state.characters[entityId];

  if (!character || character.controller !== CHARACTER_CONTROLLER_TYPES.player) {
    return false;
  }

  const option = getPlayerAppearanceOption(appearanceId);

  if (!option) {
    return false;
  }

  character.sprite = normalizeCharacterSprite(
    character.id,
    buildPlayerAppearanceSpriteDefinition(option),
    character.appearance.radius,
  );
  state.ui.playerAppearanceId = option.id;

  return true;
}
