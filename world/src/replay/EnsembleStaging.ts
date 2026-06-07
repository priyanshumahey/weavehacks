// EnsembleStaging — lays every group out across the playfield. Each group sits
// at its normalized anchor; its members ring a tight huddle around it. Produces
// the world CharacterDefinitions plus the lookup tables the scene needs (which
// group a character belongs to, and each group's world centre).

import {
  getLocationById,
  winterfellWorldLayout,
} from "../data/locations/winterfellWorldLayout";
import { getLocationBounds } from "../rendering/world/locationBounds";
import type { CharacterDefinition, WorldBounds } from "../types/character";
import {
  CHARACTER_CONTROLLER_TYPES,
  CHARACTER_KINDS,
  CHARACTER_MOVEMENT_MODES,
} from "../world/worldState";
import type { EnsembleGroup, EnsembleReplay, GroupMood } from "./ensembleTypes";

const DISPLAY_HEIGHT = 75;
const WANDER_SPEED = 85;

// Collision footprint per character. Min centre-to-centre separation between
// two characters is twice this (collisionSystem); the huddle gaps below stay
// comfortably above it so the ring never fights separation.
const BODY_RADIUS = 22;

// How far below the huddle characters spawn before walking in, plus the lateral
// spacing so they file up in a loose line rather than stacking on one point.
const ENTRANCE_DROP = 180;
const ENTRANCE_SPREAD = 50;

// Desired centre-to-centre gap between NEIGHBOURS in the ring, per mood. The
// actual ring radius is derived from this and the cast size, so a pair stands
// close and a crowd opens up — instead of a fixed radius that flings pairs far
// apart. Friendly clusters close, tense keeps space, hostile stands off.
const MOOD_GAP: Record<GroupMood, number> = {
  friendly: 66,
  tense: 82,
  hostile: 108,
};

/** Ring radius so adjacent members sit ~`gap` apart for a group of `count`. */
function ringRadius(mood: GroupMood, count: number): number {
  if (count <= 1) {
    return 0;
  }
  const gap = MOOD_GAP[mood];
  // chord = 2 R sin(pi / n)  ->  R = gap / (2 sin(pi / n))
  const r = gap / (2 * Math.sin(Math.PI / count));
  // Never let bodies touch even if the formula rounds tight.
  return Math.max(r, BODY_RADIUS + 8);
}

export interface GroupLayout {
  group: EnsembleGroup;
  centre: { x: number; y: number };
  radius: number;
  /** Member key -> home position in the huddle ring. */
  homes: Map<string, { x: number; y: number }>;
  /** Member key -> entrance spawn position (below the huddle). */
  spawns: Map<string, { x: number; y: number }>;
}

export interface EnsembleStaging {
  definitions: CharacterDefinition[];
  layouts: Map<string, GroupLayout>; // by group id
  groupIdByCharacter: Map<string, string>;
}

function resolveGroupBounds(group: EnsembleGroup): WorldBounds {
  const locationId = group.locationId ?? winterfellWorldLayout.defaultLocationId;
  const location = getLocationById(locationId);

  if (!location) {
    throw new Error(`Unknown ensemble group location: ${locationId}`);
  }

  return getLocationBounds(location);
}

function groupCentre(group: EnsembleGroup): { x: number; y: number } {
  const bounds = resolveGroupBounds(group);

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

export function buildEnsembleStaging(replay: EnsembleReplay): EnsembleStaging {
  const definitions: CharacterDefinition[] = [];
  const layouts = new Map<string, GroupLayout>();
  const groupIdByCharacter = new Map<string, string>();

  for (const group of replay.groups) {
    const centre = groupCentre(group);
    const radius = ringRadius(group.mood, group.cast.length);
    const bounds = resolveGroupBounds(group);
    const homes = new Map<string, { x: number; y: number }>();
    const spawns = new Map<string, { x: number; y: number }>();
    const count = group.cast.length;

    group.cast.forEach((member, index) => {
      const home = ringHome(index, count, centre, radius);
      homes.set(member.key, home);
      groupIdByCharacter.set(member.key, group.id);

      // Enter from below the huddle in a loose, staggered line, clamped inside
      // the location so nobody spawns off the playfield.
      const lateral = (index - (count - 1) / 2) * ENTRANCE_SPREAD;
      const spawn = {
        x: clamp(centre.x + lateral, bounds.minX, bounds.maxX),
        y: clamp(centre.y + radius + ENTRANCE_DROP, bounds.minY, bounds.maxY),
      };
      spawns.set(member.key, spawn);

      definitions.push({
        id: member.key,
        name: member.name,
        kind: CHARACTER_KINDS.npc,
        controller: CHARACTER_CONTROLLER_TYPES.script,
        position: spawn,
        appearance: { radius: BODY_RADIUS },
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

    layouts.set(group.id, { group, centre, radius, homes, spawns });
  }

  return { definitions, layouts, groupIdByCharacter };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
