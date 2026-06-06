import {
  buildAgentObservation,
  type AgentObservation,
  type AgentObservationOptions,
} from "../agents/buildAgentObservation";
import type {
  CharacterControllerType,
  CharacterState,
  WorldState,
} from "./worldState";
import type { MovementIntent, WorldAction } from "./worldActions";
import { WORLD_ACTION_TYPES } from "./worldActions";
import { boundsSystem } from "./systems/boundsSystem";
import { collisionSystem } from "./systems/collisionSystem";
import { applyFaceAction } from "./systems/facingSystem";
import {
  attemptInteractionSystem,
  inspectTargetSystem,
  selectTargetSystem,
  startDialogueSystem,
  syncCharacterInteractionSystem,
  syncInteractionSystem,
} from "./systems/interactionSystem";
import { animationSystem } from "./systems/animationSystem";
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

  dispatch(action: WorldAction, controller: CharacterControllerType): boolean {
    if (!this.canDispatch(action.entityId, controller)) {
      return false;
    }

    switch (action.type) {
      case WORLD_ACTION_TYPES.move:
        this.applyMoveIntent(action.entityId, action.intent);
        return true;
      case WORLD_ACTION_TYPES.interact:
        attemptInteractionSystem(this.state, action.entityId);
        return true;
      case WORLD_ACTION_TYPES.face:
        return applyFaceAction(this.state, action.entityId, {
          facing: action.facing,
          targetEntityId: action.targetEntityId,
        });
      case WORLD_ACTION_TYPES.select:
        return selectTargetSystem(this.state, action.entityId, action.targetEntityId);
      case WORLD_ACTION_TYPES.inspect:
        return inspectTargetSystem(this.state, action.entityId, action.targetEntityId);
      case WORLD_ACTION_TYPES.startDialogue:
        return startDialogueSystem(this.state, action.entityId, action.targetEntityId);
      default:
        return false;
    }
  }

  step(deltaMs: number): void {
    const scaledDeltaMs = deltaMs * this.state.time.timeScale;

    movementSystem(this.state, scaledDeltaMs);
    animationSystem(this.state);
    collisionSystem(this.state);
    boundsSystem(this.state);
    syncCharacterInteractionSystem(this.state);
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

  getObservation(
    entityId: string,
    options?: AgentObservationOptions,
  ): AgentObservation | null {
    return buildAgentObservation(this.state, entityId, options);
  }

  getCharactersByController(controller: CharacterControllerType): CharacterState[] {
    return Object.values(this.state.characters).filter((character) => {
      return character.controller === controller;
    });
  }

  canDispatch(entityId: string, controller: CharacterControllerType): boolean {
    const character = this.state.characters[entityId];

    if (!character) {
      return false;
    }

    return character.controller === controller;
  }

  private applyMoveIntent(entityId: string, intent: MovementIntent): void {
    const character = this.state.characters[entityId];

    if (!character) {
      return;
    }

    character.moveIntent = normalizeIntent(intent);
  }
}
