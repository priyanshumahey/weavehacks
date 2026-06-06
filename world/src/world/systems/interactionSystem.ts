import type { CharacterState, UiPromptState, WorldState } from "../worldState";

const INTERACTION_PADDING = 24;

function getDistance(first: CharacterState, second: CharacterState): number {
  return Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y);
}

function getInteractionRange(source: CharacterState, target: CharacterState): number {
  return source.appearance.radius + target.appearance.radius + INTERACTION_PADDING;
}

function createPrompt(target: CharacterState): UiPromptState {
  return {
    entityId: target.id,
    text: `Talk to ${target.name}`,
  };
}

export function findNearestInteractableCharacter(
  state: WorldState,
  source: CharacterState,
): CharacterState | null {
  let nearestCharacter: CharacterState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of Object.values(state.characters)) {
    if (candidate.id === source.id || !candidate.interactable) {
      continue;
    }

    const distance = getDistance(source, candidate);

    if (distance > getInteractionRange(source, candidate) || distance >= nearestDistance) {
      continue;
    }

    nearestCharacter = candidate;
    nearestDistance = distance;
  }

  return nearestCharacter;
}

export function syncInteractionSystem(state: WorldState): void {
  if (!state.playerId) {
    state.ui.prompt = null;
    state.ui.dialogue = null;
    state.ui.inspection = null;
    state.ui.selectedEntityId = null;
    return;
  }

  const player = state.characters[state.playerId];

  if (!player) {
    state.ui.prompt = null;
    state.ui.dialogue = null;
    state.ui.inspection = null;
    state.ui.selectedEntityId = null;
    return;
  }

  const target = findNearestInteractableCharacter(state, player);

  state.ui.prompt = target ? createPrompt(target) : null;
  state.ui.selectedEntityId = target?.id ?? player.id;
  state.ui.inspection = target
    ? {
        entityId: target.id,
        visible: true,
      }
    : null;

  if (state.ui.dialogue && state.ui.dialogue.entityId !== target?.id) {
    state.ui.dialogue = null;
  }
}

export function attemptInteractionSystem(state: WorldState, entityId: string): void {
  const source = state.characters[entityId];

  if (!source) {
    return;
  }

  const target = findNearestInteractableCharacter(state, source);

  state.ui.selectedEntityId = target?.id ?? entityId;
  state.ui.prompt = target ? createPrompt(target) : null;
  state.ui.inspection = target
    ? {
        entityId: target.id,
        visible: true,
      }
    : null;
  state.ui.dialogue = target?.dialogueId
    ? {
        entityId: target.id,
        dialogueId: target.dialogueId,
        visible: true,
      }
    : null;
}
