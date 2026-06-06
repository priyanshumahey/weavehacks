import type { CharacterSpriteFacing } from "../types/characterSprite";

export interface MovementIntent {
  x: number;
  y: number;
}

export const WORLD_ACTION_TYPES = {
  move: "move",
  interact: "interact",
  face: "face",
  select: "select",
  inspect: "inspect",
  startDialogue: "startDialogue",
} as const;

export type WorldActionType =
  (typeof WORLD_ACTION_TYPES)[keyof typeof WORLD_ACTION_TYPES];

export type WorldAction =
  | {
      type: typeof WORLD_ACTION_TYPES.move;
      entityId: string;
      intent: MovementIntent;
    }
  | {
      type: typeof WORLD_ACTION_TYPES.interact;
      entityId: string;
    }
  | {
      type: typeof WORLD_ACTION_TYPES.face;
      entityId: string;
      facing?: CharacterSpriteFacing;
      targetEntityId?: string;
    }
  | {
      type: typeof WORLD_ACTION_TYPES.select;
      entityId: string;
      targetEntityId: string;
    }
  | {
      type: typeof WORLD_ACTION_TYPES.inspect;
      entityId: string;
      targetEntityId: string;
    }
  | {
      type: typeof WORLD_ACTION_TYPES.startDialogue;
      entityId: string;
      targetEntityId: string;
    };
