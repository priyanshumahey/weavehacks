import type { CharacterAgent, CharacterAgentObservation } from "./characterAgent";
import { WORLD_ACTION_TYPES, type WorldAction } from "../world/worldActions";

export class ScoutGreeterAgent implements CharacterAgent {
  readonly characterId: string;

  constructor(characterId: string) {
    this.characterId = characterId;
  }

  decide(_observation: CharacterAgentObservation): WorldAction[] {
    return [
      {
        type: WORLD_ACTION_TYPES.move,
        entityId: this.characterId,
        intent: { x: 0, y: 0 },
      },
    ];
  }
}
