import type {
  CharacterDefinition,
  CharacterKind,
  CharacterControllerType,
  CharacterInstance,
  CharacterMovementMode,
  NormalizedCharacterDefinition,
} from "../../types/character";

const DEFAULT_APPEARANCE = {
  color: "#f4f1de",
  radius: 18,
  labelColor: "#f4f1de",
} as const;

const DEFAULT_MOVEMENT = {
  mode: "idle",
  speed: 180,
} as const;

function assertString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Character field "${fieldName}" must be a non-empty string.`);
  }

  return value.trim();
}

function normalizeNumber(value: unknown, fallback: number, fieldName: string): number {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`Character field "${fieldName}" must be a number.`);
  }

  return value;
}

function isMovementMode(value: unknown): value is CharacterMovementMode {
  return value === "idle" || value === "player";
}

function isControllerType(value: unknown): value is CharacterControllerType {
  return value === "player" || value === "script" || value === "agent";
}

function getDefaultController(kind: CharacterKind): CharacterControllerType {
  return kind === "player" ? "player" : "script";
}

export function normalizeCharacterDefinition(
  definition: CharacterDefinition,
): NormalizedCharacterDefinition {
  const id = assertString(definition.id, "id");
  const name = assertString(definition.name, "name");
  const kind = definition.kind === "player" ? "player" : "npc";
  const controller = definition.controller ?? getDefaultController(kind);
  const appearance = {
    ...DEFAULT_APPEARANCE,
    ...(definition.appearance ?? {}),
  };
  const movement = {
    ...DEFAULT_MOVEMENT,
    ...(definition.movement ?? {}),
  };

  if (!isMovementMode(movement.mode)) {
    throw new Error(
      `Character "${id}" has unsupported movement mode "${String(movement.mode)}".`,
    );
  }

  if (!isControllerType(controller)) {
    throw new Error(
      `Character "${id}" has unsupported controller "${String(controller)}".`,
    );
  }

  return {
    id,
    name,
    kind,
    controller,
    position: {
      x: normalizeNumber(definition.position?.x, 0, "position.x"),
      y: normalizeNumber(definition.position?.y, 0, "position.y"),
    },
    appearance: {
      color: appearance.color,
      radius: normalizeNumber(
        appearance.radius,
        DEFAULT_APPEARANCE.radius,
        "appearance.radius",
      ),
      labelColor: appearance.labelColor,
    },
    movement: {
      mode: movement.mode,
      speed: normalizeNumber(movement.speed, DEFAULT_MOVEMENT.speed, "movement.speed"),
    },
    dialogueId: definition.dialogueId ?? null,
    zoneId: definition.zoneId ?? null,
    tags: Array.isArray(definition.tags) ? definition.tags : [],
    traits: Array.isArray(definition.traits) ? definition.traits : [],
  };
}

export function createCharacterInstance(definition: CharacterDefinition): CharacterInstance {
  const normalized = normalizeCharacterDefinition(definition);

  return {
    ...normalized,
    entityKind: "character",
    blocksMovement: true,
    interactable: normalized.dialogueId != null,
    velocity: {
      x: 0,
      y: 0,
    },
    moveIntent: {
      x: 0,
      y: 0,
    },
    x: normalized.position.x,
    y: normalized.position.y,
  };
}
