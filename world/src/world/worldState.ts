import type {
  CharacterSpriteAnimationKey,
  CharacterSpriteFacing,
  CharacterSpriteMetadata,
} from "../types/characterSprite";
import type { PropCategory } from "../types/prop";
import type { PropSpriteMetadata } from "../types/propSprite";

export interface Vector2 {
  x: number;
  y: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const ENTITY_KINDS = {
  character: "character",
  prop: "prop",
  trigger: "trigger",
} as const;

export type EntityKind = (typeof ENTITY_KINDS)[keyof typeof ENTITY_KINDS];

export const CHARACTER_KINDS = {
  player: "player",
  npc: "npc",
} as const;

export type CharacterKind = (typeof CHARACTER_KINDS)[keyof typeof CHARACTER_KINDS];

export const CHARACTER_MOVEMENT_MODES = {
  idle: "idle",
  player: "player",
} as const;

export type CharacterMovementMode =
  (typeof CHARACTER_MOVEMENT_MODES)[keyof typeof CHARACTER_MOVEMENT_MODES];

export const CHARACTER_CONTROLLER_TYPES = {
  player: "player",
  script: "script",
  agent: "agent",
} as const;

export type CharacterControllerType =
  (typeof CHARACTER_CONTROLLER_TYPES)[keyof typeof CHARACTER_CONTROLLER_TYPES];

export interface EntityAppearance {
  color: string;
  radius: number;
  labelColor: string;
}

export interface CharacterMovementState {
  mode: CharacterMovementMode;
  speed: number;
}

export const EMPTY_CHARACTER_INTERACTION = {
  selectedEntityId: null,
  inspectedEntityId: null,
  dialogueEntityId: null,
} as const;

export interface CharacterInteractionState {
  selectedEntityId: string | null;
  inspectedEntityId: string | null;
  dialogueEntityId: string | null;
}

export interface WorldEntityState {
  id: string;
  kind: EntityKind;
  name: string;
  position: Vector2;
  tags: string[];
  traits: string[];
  zoneId: string | null;
  blocksMovement: boolean;
  interactable: boolean;
}

export interface PropState extends WorldEntityState {
  kind: typeof ENTITY_KINDS.prop;
  category: PropCategory;
  sprite: PropSpriteMetadata;
}

export function isPropState(entity: WorldEntityState): entity is PropState {
  return entity.kind === ENTITY_KINDS.prop;
}

export interface CharacterState extends WorldEntityState {
  kind: typeof ENTITY_KINDS.character;
  characterKind: CharacterKind;
  controller: CharacterControllerType;
  appearance: EntityAppearance;
  sprite: CharacterSpriteMetadata;
  movement: CharacterMovementState;
  velocity: Vector2;
  moveIntent: Vector2;
  facing: CharacterSpriteFacing;
  animation: CharacterSpriteAnimationKey;
  dialogueId: string | null;
  interaction: CharacterInteractionState;
}

export interface ZoneState {
  id: string;
  name: string;
  bounds: WorldBounds;
  entityIds: string[];
  tags: string[];
  description: string | null;
}

export interface UiPromptState {
  entityId: string;
  text: string;
}

export interface DialoguePanelState {
  entityId: string;
  dialogueId: string;
  visible: boolean;
}

export interface InspectionState {
  entityId: string;
  visible: boolean;
}

export interface UiState {
  prompt: UiPromptState | null;
  dialogue: DialoguePanelState | null;
  inspection: InspectionState | null;
  selectedEntityId: string | null;
}

export interface WorldTimeState {
  elapsedMs: number;
  tick: number;
  timeScale: number;
}

export interface WorldState {
  seed: string;
  bounds: WorldBounds;
  playerId: string | null;
  characters: Record<string, CharacterState>;
  entities: Record<string, WorldEntityState>;
  zones: Record<string, ZoneState>;
  ui: UiState;
  time: WorldTimeState;
}
