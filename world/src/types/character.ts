import type {
  CharacterKind,
  CharacterMovementMode,
  EntityAppearance,
  Vector2,
  WorldBounds,
} from "../world/worldState";

export type { CharacterKind, CharacterMovementMode, WorldBounds };

export interface CharacterDefinition {
  id: string;
  name: string;
  kind?: CharacterKind;
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
  tags?: string[];
  traits?: string[];
}

export interface NormalizedCharacterDefinition {
  id: string;
  name: string;
  kind: CharacterKind;
  position: Vector2;
  appearance: EntityAppearance;
  movement: {
    mode: CharacterMovementMode;
    speed: number;
  };
  dialogueId: string | null;
  zoneId: string | null;
  tags: string[];
  traits: string[];
}

export interface CharacterInstance
  extends NormalizedCharacterDefinition {
  entityKind: "character";
  blocksMovement: boolean;
  interactable: boolean;
  velocity: Vector2;
  moveIntent: Vector2;
  kind: CharacterKind;
  x: number;
  y: number;
}
