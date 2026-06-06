import {
  findNearestInteractableCharacter,
  resolveInteractionTarget,
} from "../world/systems/interactionSystem";
import type { CharacterSpriteFacing } from "../types/characterSprite";
import type {
  CharacterState,
  DialoguePanelState,
  InspectionState,
  UiPromptState,
  WorldBounds,
  WorldEntityState,
  WorldState,
  WorldTimeState,
  ZoneState,
} from "../world/worldState";
import { ENTITY_KINDS } from "../world/worldState";

const DEFAULT_PERCEPTION_RADIUS = 180;

export interface AgentObservationOptions {
  perceptionRadius?: number;
}

export interface AgentCharacterObservation {
  id: string;
  name: string;
  characterKind: CharacterState["characterKind"];
  controller: CharacterState["controller"];
  position: {
    x: number;
    y: number;
  };
  velocity: {
    x: number;
    y: number;
  };
  moveIntent: {
    x: number;
    y: number;
  };
  facing: CharacterSpriteFacing;
  zoneId: string | null;
  dialogueId: string | null;
  traits: readonly string[];
  tags: readonly string[];
}

export interface NearbyCharacterObservation extends AgentCharacterObservation {
  distance: number;
  interactable: boolean;
  blocksMovement: boolean;
}

export interface NearbyEntityObservation {
  id: string;
  name: string;
  kind: WorldEntityState["kind"];
  position: {
    x: number;
    y: number;
  };
  zoneId: string | null;
  distance: number;
  interactable: boolean;
  blocksMovement: boolean;
  traits: readonly string[];
  tags: readonly string[];
}

export interface AgentInteractionObservation {
  target: NearbyCharacterObservation | null;
  focus: NearbyCharacterObservation | NearbyEntityObservation | null;
  prompt: UiPromptState | null;
  selectedEntityId: string | null;
}

export interface AgentZoneObservation {
  id: string;
  name: string;
  bounds: Readonly<WorldBounds>;
  entityIds: readonly string[];
  tags: readonly string[];
  description: string | null;
}

export interface AgentObservation {
  self: AgentCharacterObservation;
  nearbyCharacters: readonly NearbyCharacterObservation[];
  nearbyEntities: readonly NearbyEntityObservation[];
  activeInteraction: AgentInteractionObservation;
  dialogue: DialoguePanelState | null;
  inspection: InspectionState | null;
  zone: AgentZoneObservation | null;
  bounds: Readonly<WorldBounds>;
  time: Readonly<WorldTimeState>;
}

function getDistance(
  source: Pick<CharacterState, "position">,
  target: Pick<CharacterState | WorldEntityState, "position">,
): number {
  return Math.hypot(source.position.x - target.position.x, source.position.y - target.position.y);
}

function cloneBounds(bounds: WorldBounds): Readonly<WorldBounds> {
  return Object.freeze({
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
  });
}

function cloneTime(time: WorldTimeState): Readonly<WorldTimeState> {
  return Object.freeze({
    elapsedMs: time.elapsedMs,
    tick: time.tick,
    timeScale: time.timeScale,
  });
}

function clonePrompt(prompt: UiPromptState | null): UiPromptState | null {
  if (!prompt) {
    return null;
  }

  return Object.freeze({
    entityId: prompt.entityId,
    text: prompt.text,
  });
}

function cloneDialogue(dialogue: DialoguePanelState | null): DialoguePanelState | null {
  if (!dialogue) {
    return null;
  }

  return Object.freeze({
    entityId: dialogue.entityId,
    dialogueId: dialogue.dialogueId,
    visible: dialogue.visible,
  });
}

function cloneInspection(inspection: InspectionState | null): InspectionState | null {
  if (!inspection) {
    return null;
  }

  return Object.freeze({
    entityId: inspection.entityId,
    visible: inspection.visible,
  });
}

function cloneZone(zone: ZoneState | null): AgentZoneObservation | null {
  if (!zone) {
    return null;
  }

  return Object.freeze({
    id: zone.id,
    name: zone.name,
    bounds: cloneBounds(zone.bounds),
    entityIds: Object.freeze([...zone.entityIds]),
    tags: Object.freeze([...zone.tags]),
    description: zone.description,
  });
}

function createCharacterObservation(character: CharacterState): AgentCharacterObservation {
  return Object.freeze({
    id: character.id,
    name: character.name,
    characterKind: character.characterKind,
    controller: character.controller,
    position: Object.freeze({
      x: character.position.x,
      y: character.position.y,
    }),
    velocity: Object.freeze({
      x: character.velocity.x,
      y: character.velocity.y,
    }),
    moveIntent: Object.freeze({
      x: character.moveIntent.x,
      y: character.moveIntent.y,
    }),
    facing: character.facing,
    zoneId: character.zoneId,
    dialogueId: character.dialogueId,
    traits: Object.freeze([...character.traits]),
    tags: Object.freeze([...character.tags]),
  });
}

function createNearbyCharacterObservation(
  source: CharacterState,
  character: CharacterState,
): NearbyCharacterObservation {
  return Object.freeze({
    ...createCharacterObservation(character),
    distance: getDistance(source, character),
    interactable: character.interactable,
    blocksMovement: character.blocksMovement,
  });
}

function createNearbyEntityObservation(
  source: CharacterState,
  entity: WorldEntityState,
): NearbyEntityObservation {
  return Object.freeze({
    id: entity.id,
    name: entity.name,
    kind: entity.kind,
    position: Object.freeze({
      x: entity.position.x,
      y: entity.position.y,
    }),
    zoneId: entity.zoneId,
    distance: getDistance(source, entity),
    interactable: entity.interactable,
    blocksMovement: entity.blocksMovement,
    traits: Object.freeze([...entity.traits]),
    tags: Object.freeze([...entity.tags]),
  });
}

function createFocusedObservation(
  state: WorldState,
  observer: CharacterState,
): NearbyCharacterObservation | NearbyEntityObservation | null {
  const focusedEntityId = observer.interaction.selectedEntityId;

  if (!focusedEntityId) {
    return null;
  }

  const focusedCharacter = state.characters[focusedEntityId];

  if (focusedCharacter) {
    return createNearbyCharacterObservation(observer, focusedCharacter);
  }

  const focusedEntity = state.entities[focusedEntityId];

  if (!focusedEntity) {
    return null;
  }

  return createNearbyEntityObservation(observer, focusedEntity);
}

function createDialogueObservation(
  state: WorldState,
  observer: CharacterState,
): DialoguePanelState | null {
  const dialogueEntityId = observer.interaction.dialogueEntityId;

  if (!dialogueEntityId) {
    return null;
  }

  const target = state.characters[dialogueEntityId];

  if (!target?.dialogueId) {
    return null;
  }

  return Object.freeze({
    entityId: target.id,
    dialogueId: target.dialogueId,
    visible: true,
  });
}

function createInspectionObservation(
  observer: CharacterState,
): InspectionState | null {
  const inspectedEntityId = observer.interaction.inspectedEntityId;

  if (!inspectedEntityId) {
    return null;
  }

  return Object.freeze({
    entityId: inspectedEntityId,
    visible: true,
  });
}

export function buildAgentObservation(
  state: WorldState,
  characterId: string,
  options: AgentObservationOptions = {},
): AgentObservation | null {
  const observer = state.characters[characterId];

  if (!observer) {
    return null;
  }

  const perceptionRadius = options.perceptionRadius ?? DEFAULT_PERCEPTION_RADIUS;
  const activeTarget = findNearestInteractableCharacter(state, observer);

  const nearbyCharacters = Object.freeze(
    Object.values(state.characters)
      .filter((character) => character.id !== observer.id)
      .map((character) => createNearbyCharacterObservation(observer, character))
      .filter((character) => character.distance <= perceptionRadius)
      .sort((first, second) => first.distance - second.distance),
  );

  const nearbyEntities = Object.freeze(
    Object.values(state.entities)
      .map((entity) => createNearbyEntityObservation(observer, entity))
      .filter((entity) => entity.distance <= perceptionRadius)
      .sort((first, second) => first.distance - second.distance),
  );

  const focus = createFocusedObservation(state, observer);
  const focusedTarget = observer.interaction.selectedEntityId
    ? resolveInteractionTarget(state, observer.id, observer.interaction.selectedEntityId)
    : null;

  const prompt = focusedTarget
    ? clonePrompt({
        entityId: focusedTarget.id,
        text:
          focusedTarget.kind === ENTITY_KINDS.character &&
          state.characters[focusedTarget.id]?.dialogueId
            ? `Talk to ${focusedTarget.name}`
            : `Inspect ${focusedTarget.name}`,
      })
    : activeTarget
      ? clonePrompt({
          entityId: activeTarget.id,
          text: `Talk to ${activeTarget.name}`,
        })
      : null;

  return Object.freeze({
    self: createCharacterObservation(observer),
    nearbyCharacters,
    nearbyEntities,
    activeInteraction: Object.freeze({
      target: activeTarget ? createNearbyCharacterObservation(observer, activeTarget) : null,
      focus,
      prompt,
      selectedEntityId: observer.interaction.selectedEntityId,
    }),
    dialogue: cloneDialogue(createDialogueObservation(state, observer)),
    inspection: cloneInspection(createInspectionObservation(observer)),
    zone: cloneZone(observer.zoneId ? state.zones[observer.zoneId] ?? null : null),
    bounds: cloneBounds(state.bounds),
    time: cloneTime(state.time),
  });
}
