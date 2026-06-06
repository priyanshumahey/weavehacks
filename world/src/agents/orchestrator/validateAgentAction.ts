import {
  CHARACTER_SPRITE_FACING,
  type CharacterSpriteFacing,
} from "../../types/characterSprite";
import { WORLD_ACTION_TYPES, type WorldAction } from "../../world/worldActions";

export const AGENT_ACTION_REJECTION_REASONS = {
  wrongEntity: "wrong_entity",
  unknownType: "unknown_type",
  invalidMoveIntent: "invalid_move_intent",
  invalidFacing: "invalid_facing",
  missingTarget: "missing_target",
} as const;

export type AgentActionRejectionReason =
  (typeof AGENT_ACTION_REJECTION_REASONS)[keyof typeof AGENT_ACTION_REJECTION_REASONS];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCharacterFacing(value: unknown): value is CharacterSpriteFacing {
  return (
    typeof value === "string" &&
    Object.values(CHARACTER_SPRITE_FACING).includes(value as CharacterSpriteFacing)
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function validateAgentAction(
  action: WorldAction,
  agentCharacterId: string,
): AgentActionRejectionReason | null {
  if (action.entityId !== agentCharacterId) {
    return AGENT_ACTION_REJECTION_REASONS.wrongEntity;
  }

  switch (action.type) {
    case WORLD_ACTION_TYPES.move:
      if (!isFiniteNumber(action.intent.x) || !isFiniteNumber(action.intent.y)) {
        return AGENT_ACTION_REJECTION_REASONS.invalidMoveIntent;
      }
      return null;
    case WORLD_ACTION_TYPES.interact:
      return null;
    case WORLD_ACTION_TYPES.face:
      if (action.targetEntityId) {
        return isNonEmptyString(action.targetEntityId)
          ? null
          : AGENT_ACTION_REJECTION_REASONS.missingTarget;
      }

      return action.facing && isCharacterFacing(action.facing)
        ? null
        : AGENT_ACTION_REJECTION_REASONS.invalidFacing;
    case WORLD_ACTION_TYPES.select:
    case WORLD_ACTION_TYPES.inspect:
    case WORLD_ACTION_TYPES.startDialogue:
      return isNonEmptyString(action.targetEntityId)
        ? null
        : AGENT_ACTION_REJECTION_REASONS.missingTarget;
    default:
      return AGENT_ACTION_REJECTION_REASONS.unknownType;
  }
}
