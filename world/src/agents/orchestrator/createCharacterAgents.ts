import { ScoutGreeterAgent } from "../ScoutGreeterAgent";
import type { CharacterAgent } from "../characterAgent";
import {
  CHARACTER_CONTROLLER_TYPES,
  type CharacterState,
} from "../../world/worldState";

function createAgentForCharacter(character: CharacterState): CharacterAgent | null {
  if (character.controller !== CHARACTER_CONTROLLER_TYPES.agent) {
    return null;
  }

  switch (character.id) {
    case "arya-stark":
      return new ScoutGreeterAgent(character.id);
    default:
      return null;
  }
}

export function createCharacterAgents(
  characters: Record<string, CharacterState>,
): CharacterAgent[] {
  return Object.values(characters).flatMap((character) => {
    const agent = createAgentForCharacter(character);
    return agent ? [agent] : [];
  });
}
