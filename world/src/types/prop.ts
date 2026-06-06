import type { Vector2 } from "../world/worldState";
import { ENTITY_KINDS } from "../world/worldState";
import type { PropSpriteDefinition, PropSpriteMetadata } from "./propSprite";

export const PROP_CATEGORIES = {
  building: "building",
  resource: "resource",
  decoration: "decoration",
} as const;

export type PropCategory = (typeof PROP_CATEGORIES)[keyof typeof PROP_CATEGORIES];

export interface PropDefinition {
  id: string;
  name: string;
  category?: PropCategory;
  zoneId?: string | null;
  position?: {
    x?: number;
    y?: number;
  };
  sprite?: PropSpriteDefinition;
  blocksMovement?: boolean;
  interactable?: boolean;
  tags?: string[];
  traits?: string[];
}

export interface NormalizedPropDefinition {
  id: string;
  name: string;
  category: PropCategory;
  position: Vector2;
  sprite: PropSpriteMetadata;
  blocksMovement: boolean;
  interactable: boolean;
  zoneId: string | null;
  tags: string[];
  traits: string[];
}

export interface PropInstance extends NormalizedPropDefinition {
  entityKind: typeof ENTITY_KINDS.prop;
}
