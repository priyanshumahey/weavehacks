import {
  resolveCharacterAnimation,
  resolveCharacterFacing,
} from "../../domain/characters/resolveCharacterFacing";
import type { WorldState } from "../worldState";

export function animationSystem(state: WorldState): void {
  for (const character of Object.values(state.characters)) {
    character.animation = resolveCharacterAnimation(character.moveIntent);
    character.facing = resolveCharacterFacing(character.moveIntent, character.facing);
  }
}
