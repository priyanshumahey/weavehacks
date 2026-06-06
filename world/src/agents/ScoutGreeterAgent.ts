import type { CharacterAgent, CharacterAgentObservation } from "./characterAgent";
import { WORLD_ACTION_TYPES, type WorldAction } from "../world/worldActions";

const PLAYER_GREETING_DISTANCE = 72;

export class ScoutGreeterAgent implements CharacterAgent {
  readonly characterId: string;

  constructor(characterId: string) {
    this.characterId = characterId;
  }

  decide(observation: CharacterAgentObservation): WorldAction[] {
    const player = observation.nearbyCharacters.find((character) => character.id === "player");

    if (!player) {
      return [
        {
          type: WORLD_ACTION_TYPES.move,
          entityId: this.characterId,
          intent: { x: 0, y: 0 },
        },
      ];
    }

    const inRange = player.distance <= PLAYER_GREETING_DISTANCE;

    if (inRange) {
      return [
        {
          type: WORLD_ACTION_TYPES.face,
          entityId: this.characterId,
          targetEntityId: player.id,
        },
        {
          type: WORLD_ACTION_TYPES.select,
          entityId: this.characterId,
          targetEntityId: player.id,
        },
        {
          type: WORLD_ACTION_TYPES.inspect,
          entityId: this.characterId,
          targetEntityId: player.id,
        },
        {
          type: WORLD_ACTION_TYPES.startDialogue,
          entityId: this.characterId,
          targetEntityId: this.characterId,
        },
        {
          type: WORLD_ACTION_TYPES.move,
          entityId: this.characterId,
          intent: { x: 0, y: 0 },
        },
      ];
    }

    const dx = player.position.x - observation.self.position.x;
    const dy = player.position.y - observation.self.position.y;
    const magnitude = Math.hypot(dx, dy);

    if (magnitude === 0) {
      return [
        {
          type: WORLD_ACTION_TYPES.move,
          entityId: this.characterId,
          intent: { x: 0, y: 0 },
        },
      ];
    }

    return [
      {
        type: WORLD_ACTION_TYPES.move,
        entityId: this.characterId,
        intent: {
          x: dx / magnitude,
          y: dy / magnitude,
        },
      },
    ];
  }
}
