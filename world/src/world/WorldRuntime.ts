import type { CharacterState, WorldState } from "./worldState";
import type { MovementIntent, WorldAction } from "./worldActions";
import { boundsSystem } from "./systems/boundsSystem";
import { collisionSystem } from "./systems/collisionSystem";
import {
  attemptInteractionSystem,
  syncInteractionSystem,
} from "./systems/interactionSystem";
import { movementSystem } from "./systems/movementSystem";

function normalizeIntent(intent: MovementIntent): MovementIntent {
  const magnitude = Math.hypot(intent.x, intent.y);

  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: intent.x / magnitude,
    y: intent.y / magnitude,
  };
}

export class WorldRuntime {
  private readonly state: WorldState;

  constructor(initialState: WorldState) {
    this.state = initialState;
  }

  dispatch(action: WorldAction): void {
    switch (action.type) {
      case "move":
        this.applyMoveIntent(action.entityId, action.intent);
        break;
      case "interact":
        attemptInteractionSystem(this.state, action.entityId);
        break;
    }
  }

  step(deltaMs: number): void {
    const scaledDeltaMs = deltaMs * this.state.time.timeScale;

    movementSystem(this.state, scaledDeltaMs);
    collisionSystem(this.state);
    boundsSystem(this.state);
    syncInteractionSystem(this.state);

    this.state.time.elapsedMs += scaledDeltaMs;
    this.state.time.tick += 1;
  }

  getState(): WorldState {
    return this.state;
  }

  getPlayer(): CharacterState | null {
    if (!this.state.playerId) {
      return null;
    }

    return this.state.characters[this.state.playerId] ?? null;
  }

  private applyMoveIntent(entityId: string, intent: MovementIntent): void {
    const character = this.state.characters[entityId];

    if (!character) {
      return;
    }

    character.moveIntent = normalizeIntent(intent);
  }
}
