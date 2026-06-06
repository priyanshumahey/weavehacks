import type { CharacterState, WorldState } from "./worldState";
import type { MovementIntent, WorldAction } from "./worldActions";

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
      case "interact":
        this.applyInteract(action.entityId);
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

  private applyInteract(entityId: string): void {
    const source = this.state.characters[entityId];

    if (!source) {
      return;
    }

    const target = this.findNearestInteractable(source);

    this.state.ui.selectedEntityId = target?.id ?? entityId;
    this.state.ui.prompt = target
      ? {
          entityId: target.id,
          text: `Talk to ${target.name}`,
        }
      : null;
    this.state.ui.dialogue = target?.dialogueId
      ? {
          entityId: target.id,
          dialogueId: target.dialogueId,
          visible: true,
        }
      : null;
    this.state.ui.inspection = target
      ? {
          entityId: target.id,
          visible: true,
        }
      : null;
  }

  private findNearestInteractable(source: CharacterState): CharacterState | null {
    const maxInteractionDistance = source.appearance.radius + 48;
    let nearest: CharacterState | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of Object.values(this.state.characters)) {
      if (candidate.id === source.id || !candidate.interactable) {
        continue;
      }

      const distance = Math.hypot(
        candidate.position.x - source.position.x,
        candidate.position.y - source.position.y,
      );

      if (distance > maxInteractionDistance || distance >= nearestDistance) {
        continue;
      }

      nearest = candidate;
      nearestDistance = distance;
    }

    return nearest;
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
