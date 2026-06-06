export type CharacterKind = "player" | "npc";
export type CharacterMovementMode = "idle" | "player";

export interface CharacterDefinition {
  id: string;
  name: string;
  kind?: CharacterKind;
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
  position: {
    x: number;
    y: number;
  };
  appearance: {
    color: string;
    radius: number;
    labelColor: string;
  };
  movement: {
    mode: CharacterMovementMode;
    speed: number;
  };
  dialogueId: string | null;
  tags: string[];
  traits: string[];
}

export interface CharacterInstance extends NormalizedCharacterDefinition {
  x: number;
  y: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
