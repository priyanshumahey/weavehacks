import type {
  CharacterState,
  PropState,
  UiPromptState,
  WorldEntityState,
  WorldState,
} from "../worldState";
import { ENTITY_KINDS, isPropState } from "../worldState";

const INTERACTION_PADDING = 24;

function getDistance(
  first: Pick<CharacterState, "position">,
  second: Pick<WorldEntityState, "position">,
): number {
  return Math.hypot(first.position.x - second.position.x, first.position.y - second.position.y);
}

function getEntityInteractionRadius(entity: CharacterState | PropState | WorldEntityState): number {
  if ("appearance" in entity) {
    return entity.appearance.radius;
  }

  if (isPropState(entity)) {
    return entity.sprite.collisionRadius;
  }

  return 16;
}

function getInteractionRange(
  source: CharacterState,
  target: CharacterState | PropState | WorldEntityState,
): number {
  return source.appearance.radius + getEntityInteractionRadius(target) + INTERACTION_PADDING;
}

function createPrompt(target: WorldEntityState): UiPromptState {
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

function resolveTargetInRange(
  state: WorldState,
  sourceId: string,
  targetEntityId: string,
  options: { requireInteractable: boolean },
): WorldEntityState | null {
  const source = state.characters[sourceId];

  if (!source || targetEntityId === sourceId) {
    return null;
  }

  const characterTarget = state.characters[targetEntityId];

  if (characterTarget) {
    if (options.requireInteractable && !characterTarget.interactable) {
      return null;
    }

    const distance = getDistance(source, characterTarget);

    if (distance > getInteractionRange(source, characterTarget)) {
      return null;
    }

    return characterTarget;
  }

  const entityTarget = state.entities[targetEntityId];

  if (!entityTarget || (options.requireInteractable && !entityTarget.interactable)) {
    return null;
  }

  const distance = getDistance(source, entityTarget);

  if (distance > getInteractionRange(source, entityTarget)) {
    return null;
  }

  return entityTarget;
}

export function resolveInteractionTarget(
  state: WorldState,
  sourceId: string,
  targetEntityId: string,
): WorldEntityState | null {
  return resolveTargetInRange(state, sourceId, targetEntityId, {
    requireInteractable: true,
  });
}

function resolveSelectableTarget(
  state: WorldState,
  sourceId: string,
  targetEntityId: string,
): WorldEntityState | null {
  return resolveTargetInRange(state, sourceId, targetEntityId, {
    requireInteractable: false,
  });
}

export function selectTargetSystem(
  state: WorldState,
  sourceId: string,
  targetEntityId: string,
): boolean {
  const source = state.characters[sourceId];
  const target = resolveSelectableTarget(state, sourceId, targetEntityId);

  if (!source || !target) {
    return false;
  }

  source.interaction.selectedEntityId = target.id;
  return true;
}

export function inspectTargetSystem(
  state: WorldState,
  sourceId: string,
  targetEntityId: string,
): boolean {
  const source = state.characters[sourceId];
  const target = resolveSelectableTarget(state, sourceId, targetEntityId);

  if (!source || !target) {
    return false;
  }

  source.interaction.inspectedEntityId = target.id;
  source.interaction.selectedEntityId = target.id;
  return true;
}

export function startDialogueSystem(
  state: WorldState,
  sourceId: string,
  targetEntityId: string,
): boolean {
  const source = state.characters[sourceId];
  const target = state.characters[targetEntityId];

  if (!source || !target?.dialogueId) {
    return false;
  }

  if (targetEntityId === sourceId) {
    source.interaction.dialogueEntityId = target.id;
    source.interaction.selectedEntityId = target.id;
    source.interaction.inspectedEntityId = target.id;
    return true;
  }

  const resolvedTarget = resolveInteractionTarget(state, sourceId, targetEntityId);

  if (!resolvedTarget || resolvedTarget.kind !== ENTITY_KINDS.character) {
    return false;
  }

  source.interaction.dialogueEntityId = target.id;
  source.interaction.selectedEntityId = target.id;
  source.interaction.inspectedEntityId = target.id;
  return true;
}

export function syncCharacterInteractionSystem(state: WorldState): void {
  for (const character of Object.values(state.characters)) {
    const { selectedEntityId, inspectedEntityId, dialogueEntityId } = character.interaction;

    if (
      selectedEntityId &&
      !resolveSelectableTarget(state, character.id, selectedEntityId)
    ) {
      character.interaction.selectedEntityId = null;
    }

    if (
      inspectedEntityId &&
      !resolveSelectableTarget(state, character.id, inspectedEntityId)
    ) {
      character.interaction.inspectedEntityId = null;
    }

    if (
      dialogueEntityId &&
      !resolveInteractionTarget(state, character.id, dialogueEntityId)
    ) {
      character.interaction.dialogueEntityId = null;
    }
  }
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
