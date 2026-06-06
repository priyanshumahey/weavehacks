import { WORLD_ACTION_TYPES, type WorldAction } from "../../world/worldActions";

export function createIdleMoveAction(characterId: string): WorldAction {
  return {
    type: WORLD_ACTION_TYPES.move,
    entityId: characterId,
    intent: { x: 0, y: 0 },
  };
}
