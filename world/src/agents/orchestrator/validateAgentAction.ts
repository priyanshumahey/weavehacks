import { WORLD_ACTION_TYPES, type WorldAction } from "../../world/worldActions";

export const AGENT_ACTION_REJECTION_REASONS = {
  wrongEntity: "wrong_entity",
  unknownType: "unknown_type",
  invalidMoveIntent: "invalid_move_intent",
} as const;

export type AgentActionRejectionReason =
  (typeof AGENT_ACTION_REJECTION_REASONS)[keyof typeof AGENT_ACTION_REJECTION_REASONS];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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
    default:
      return AGENT_ACTION_REJECTION_REASONS.unknownType;
  }
}
