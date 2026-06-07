// EnsembleStaging — lays every group out across the playfield. Each group sits
// at its normalized anchor; its members ring a tight huddle around it. Produces
// the world CharacterDefinitions plus the lookup tables the scene needs (which
// group a character belongs to, and each group's world centre).

import type { CharacterDefinition, WorldBounds } from "../types/character";
import {
  CHARACTER_CONTROLLER_TYPES,
  CHARACTER_KINDS,
  CHARACTER_MOVEMENT_MODES,
} from "../world/worldState";
import type { EnsembleGroup, EnsembleReplay, GroupMood } from "./ensembleTypes";

const DISPLAY_HEIGHT = 75;
const WANDER_SPEED = 60;

// Huddle radius per mood: friendly clusters tight, tense keeps a little space,
// hostile stands off at a wary distance.
const MOOD_RADIUS: Record<GroupMood, number> = {
  friendly: 50,
  tense: 64,
  hostile: 92,
};

export interface GroupLayout {
  group: EnsembleGroup;
  centre: { x: number; y: number };
  radius: number;
  /** Member key -> home position in the huddle ring. */
  homes: Map<string, { x: number; y: number }>;
}

export interface EnsembleStaging {
  definitions: CharacterDefinition[];
  layouts: Map<string, GroupLayout>; // by group id
  groupIdByCharacter: Map<string, string>;
}

function groupCentre(group: EnsembleGroup, bounds: WorldBounds): { x: number; y: number } {
  return {
    x: bounds.minX + group.anchor.x * (bounds.maxX - bounds.minX),
    y: bounds.minY + group.anchor.y * (bounds.maxY - bounds.minY),
  };
}

function ringHome(
  index: number,
  count: number,
  centre: { x: number; y: number },
  radius: number,
): { x: number; y: number } {
  if (count <= 1) {
    return { ...centre };
  }
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return {
    x: centre.x + Math.cos(angle) * radius,
    y: centre.y + Math.sin(angle) * radius,
  };
}

export function buildEnsembleStaging(
  replay: EnsembleReplay,
  bounds: WorldBounds,
): EnsembleStaging {
  const definitions: CharacterDefinition[] = [];
  const layouts = new Map<string, GroupLayout>();
  const groupIdByCharacter = new Map<string, string>();

  for (const group of replay.groups) {
    const centre = groupCentre(group, bounds);
    const radius = MOOD_RADIUS[group.mood];
    const homes = new Map<string, { x: number; y: number }>();

    group.cast.forEach((member, index) => {
      const home = ringHome(index, group.cast.length, centre, radius);
      homes.set(member.key, home);
      groupIdByCharacter.set(member.key, group.id);

      definitions.push({
        id: member.key,
        name: member.name,
        kind: CHARACTER_KINDS.npc,
        controller: CHARACTER_CONTROLLER_TYPES.script,
        position: home,
        movement: { mode: CHARACTER_MOVEMENT_MODES.idle, speed: WANDER_SPEED },
        sprite: {
          frameSourcePath: `charsets/sprites/${member.charset}`,
          displayHeight: DISPLAY_HEIGHT,
          origin: { x: 0.5, y: 1 },
          labelOffset: { x: 0, y: 0 },
        },
        traits: [],
        tags: ["replay", `group:${group.id}`],
      });
    });

    layouts.set(group.id, { group, centre, radius, homes });
  }

  return { definitions, layouts, groupIdByCharacter };
}
