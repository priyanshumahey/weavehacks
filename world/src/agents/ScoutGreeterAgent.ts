import type { CharacterAgent, CharacterAgentObservation } from "./characterAgent";
import type { WorldAction } from "../world/worldActions";

function normalizeIntent(x: number, y: number): { x: number; y: number } {
  const magnitude = Math.hypot(x, y);

  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: x / magnitude,
    y: y / magnitude,
  };
}

export class ScoutGreeterAgent implements CharacterAgent {
  readonly characterId: string;

  constructor(characterId: string) {
    this.characterId = characterId;
  }

  decide(observation: CharacterAgentObservation): WorldAction[] {
    const player = observation.nearbyCharacters.find(
      (character) => character.characterKind === "player",
    );

    if (!player) {
      return [
        {
          type: "move",
          entityId: this.characterId,
          intent: { x: 0, y: 0 },
        },
      ];
    }

    if (
      observation.activeInteraction.target?.id === player.id &&
      observation.dialogue?.entityId !== player.id
    ) {
      return [
        {
          type: "move",
          entityId: this.characterId,
          intent: { x: 0, y: 0 },
        },
        {
          type: "interact",
          entityId: this.characterId,
        },
      ];
    }

    return [
      {
        type: "move",
        entityId: this.characterId,
        intent: normalizeIntent(
          player.position.x - observation.self.position.x,
          player.position.y - observation.self.position.y,
        ),
      },
    ];
  }
}
