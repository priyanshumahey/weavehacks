import type {
  CharacterInteractionState,
  CharacterKind,
  CharacterControllerType,
  CharacterMovementMode,
  EntityAppearance,
  Vector2,
  WorldBounds,
} from "../world/worldState";
import { ENTITY_KINDS } from "../world/worldState";
import type {
  CharacterSpriteAnimationKey,
  CharacterSpriteDefinition,
  CharacterSpriteFacing,
  CharacterSpriteMetadata,
} from "./characterSprite";

export type { CharacterKind, CharacterControllerType, CharacterMovementMode, WorldBounds };
export type {
  CharacterSpriteAnimationKey,
  CharacterSpriteAnimationMapping,
  CharacterSpriteAnimations,
  CharacterSpriteDefinition,
  CharacterSpriteFacing,
  CharacterSpriteFrameDimensions,
  CharacterSpriteLabelOffset,
  CharacterSpriteMetadata,
} from "./characterSprite";

export interface CharacterDefinition {
  id: string;
  name: string;
  kind?: CharacterKind;
  controller?: CharacterControllerType;
  zoneId?: string | null;
  position?: {
    x?: number;
    y?: number;
  };
  appearance?: {
    color?: string;
    radius?: number;
    labelColor?: string;
  };
  movement?: {
    mode?: CharacterMovementMode;
    speed?: number;
  };
  dialogueId?: string | null;
  sprite?: CharacterSpriteDefinition;
  tags?: string[];
  traits?: string[];
}

export interface NormalizedCharacterDefinition {
  id: string;
  name: string;
  kind: CharacterKind;
  controller: CharacterControllerType;
  position: Vector2;
  appearance: EntityAppearance;
  movement: {
    mode: CharacterMovementMode;
    speed: number;
  };
  dialogueId: string | null;
  zoneId: string | null;
  sprite: CharacterSpriteMetadata;
  tags: string[];
  traits: string[];
}

export interface CharacterInstance
  extends NormalizedCharacterDefinition {
  entityKind: typeof ENTITY_KINDS.character;
  blocksMovement: boolean;
  interactable: boolean;
  velocity: Vector2;
  moveIntent: Vector2;
  facing: CharacterSpriteFacing;
  animation: CharacterSpriteAnimationKey;
  interaction: CharacterInteractionState;
  kind: CharacterKind;
  x: number;
  y: number;
}
