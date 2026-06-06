import type { PropDefinition, PropInstance, PropCategory } from "../../types/prop";
import { PROP_CATEGORIES } from "../../types/prop";
import { ENTITY_KINDS } from "../../world/worldState";
import { normalizePropSprite } from "./propSprite";

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Prop field "${fieldName}" must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeNumber(value: unknown, fallback: number, fieldName: string): number {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Prop field "${fieldName}" must be a number.`);
  }

  return value;
}

function isPropCategory(value: unknown): value is PropCategory {
  return Object.values(PROP_CATEGORIES).includes(value as PropCategory);
}

function resolveDefaultBlocksMovement(category: PropCategory): boolean {
  return category === PROP_CATEGORIES.building || category === PROP_CATEGORIES.resource;
}

export function normalizePropDefinition(definition: PropDefinition): PropInstance {
  const id = assertString(definition.id, "id");
  const name = assertString(definition.name, "name");
  const category = definition.category ?? PROP_CATEGORIES.decoration;

  if (!isPropCategory(category)) {
    throw new Error(`Prop "${id}" has unsupported category "${String(definition.category)}".`);
  }

  const blocksMovement = definition.blocksMovement ?? resolveDefaultBlocksMovement(category);
  const interactable = definition.interactable ?? false;

  return {
    id,
    name,
    category,
    entityKind: ENTITY_KINDS.prop,
    position: {
      x: normalizeNumber(definition.position?.x, 0, "position.x"),
      y: normalizeNumber(definition.position?.y, 0, "position.y"),
    },
    sprite: normalizePropSprite(id, definition.sprite),
    blocksMovement,
    interactable,
    zoneId: definition.zoneId ?? null,
    tags: Array.isArray(definition.tags) ? definition.tags : [],
    traits: Array.isArray(definition.traits) ? definition.traits : [],
  };
}
