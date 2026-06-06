import type { MovementIntent } from "../input/WorldInputController";
import type { CharacterState, WorldState } from "./worldState";

export type WorldAction =
  | {
      type: "move";
      entityId: string;
      intent: MovementIntent;
    };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

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
    }
  }

  step(deltaMs: number): void {
    const scaledDeltaMs = deltaMs * this.state.time.timeScale;

    for (const character of Object.values(this.state.characters)) {
      this.stepCharacter(character, scaledDeltaMs);
    }

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

  private stepCharacter(character: CharacterState, deltaMs: number): void {
    const velocity = {
      x: character.moveIntent.x * character.movement.speed,
      y: character.moveIntent.y * character.movement.speed,
    };

    character.velocity = velocity;

    const deltaSeconds = deltaMs / 1000;
    const radius = character.appearance.radius;
    const { bounds } = this.state;

    character.position.x = clamp(
      character.position.x + velocity.x * deltaSeconds,
      bounds.minX + radius,
      bounds.maxX - radius,
    );
    character.position.y = clamp(
      character.position.y + velocity.y * deltaSeconds,
      bounds.minY + radius,
      bounds.maxY - radius,
    );
  }
}
