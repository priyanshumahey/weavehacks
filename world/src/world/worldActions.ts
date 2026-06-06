export interface MovementIntent {
  x: number;
  y: number;
}

export type WorldAction =
  | {
      type: "move";
      entityId: string;
      intent: MovementIntent;
    }
  | {
      type: "interact";
      entityId: string;
    };
