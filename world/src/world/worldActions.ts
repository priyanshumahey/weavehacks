export interface MovementIntent {
  x: number;
  y: number;
}

export const WORLD_ACTION_TYPES = {
  move: "move",
  interact: "interact",
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
    };
