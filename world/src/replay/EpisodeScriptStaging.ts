// EpisodeScriptStaging — lays out a whole continuous episode across MULTIPLE
// maps at once. Unlike EnsembleStaging (which localizes one map to (0,0)), this
// keeps every location at its real world offset, so the throne room and the
// Wall render side by side and each thread's huddle sits on its own map.
//
// A character appears exactly once (spawned just below the first thread it joins,
// so it "walks in"). Each thread provides a huddle layout (centre + ring homes)
// in WORLD coordinates. The scheduler re-points characters at successive threads;
// because all maps share one coordinate plane, a character only ever moves within
// its own map's bounds (threads for a character never change location — enforced
// by the backend planner).

import {
  getLocalLocationBounds,
} from "../rendering/world/locationBounds";
import { getLocationById } from "../data/locations/winterfellWorldLayout";
import type { CharacterDefinition, WorldBounds } from "../types/character";
import {
  CHARACTER_CONTROLLER_TYPES,
  CHARACTER_KINDS,
  CHARACTER_MOVEMENT_MODES,
} from "../world/worldState";
import type { GroupMood } from "./ensembleTypes";
import type { EpisodeScript, ScriptThread } from "./episodeScriptTypes";

const DISPLAY_HEIGHT = 75;
const WANDER_SPEED = 95;
const BODY_RADIUS = 22;
const ENTRANCE_DROP = 170;
const ENTRANCE_SPREAD = 50;
// Gap between adjacent maps when they are packed side by side (split-screen).
const MAP_GAP = 160;

const MOOD_GAP: Record<GroupMood, number> = {
  friendly: 66,
  tense: 82,
  hostile: 108,
};

function ringRadius(mood: GroupMood, count: number): number {
  if (count <= 1) {
    return 0;
  }
  const gap = MOOD_GAP[mood];
  const r = gap / (2 * Math.sin(Math.PI / count));
  return Math.max(r, BODY_RADIUS + 8);
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

/** A thread staged in world space: huddle centre + per-member home/spawn. */
export interface ThreadLayout {
  thread: ScriptThread;
  locationId: string;
  centre: { x: number; y: number };
  radius: number;
  bounds: WorldBounds;
  /** Member key -> home position in the huddle ring (world coords). */
  homes: Map<string, { x: number; y: number }>;
}

export interface EpisodeScriptStaging {
  /** Every character spawned once (world definitions for createWorld). */
  definitions: CharacterDefinition[];
  /** Thread id -> its world-space layout. */
  layouts: Map<string, ThreadLayout>;
  /** Location id -> world bounds (for the camera + edge exits). */
  locationBounds: Map<string, WorldBounds>;
  /** The distinct location ids the script uses, first-appearance order. */
  locationIds: string[];
  /** Where each used map is drawn (packed side by side), for the terrain. */
  mapPlacements: { locationId: string; offsetX: number; offsetY: number }[];
  /** Ambient extras placed in world space (key -> their location bounds). */
  extras: { key: string; locationId: string; bounds: WorldBounds; behavior: "wander" | "idle" }[];
}

export function buildEpisodeScriptStaging(
  script: EpisodeScript,
): EpisodeScriptStaging {
  const layouts = new Map<string, ThreadLayout>();
  const locationBounds = new Map<string, WorldBounds>();
  const locationIds: string[] = [];

  // Discover the used locations in first-appearance order (threads first, then
  // any location only an ambient extra stands in).
  for (const thread of script.threads) {
    if (!locationIds.includes(thread.locationId)) {
      locationIds.push(thread.locationId);
    }
  }
  for (const extra of script.extras ?? []) {
    if (!locationIds.includes(extra.locationId)) {
      locationIds.push(extra.locationId);
    }
  }

  // Pack the used maps left-to-right with a gap (a split-screen of just the
  // locations this episode visits — no empty maps between them). Each location
  // gets a compact x offset; character + huddle coords live within it.
  const mapPlacements: { locationId: string; offsetX: number; offsetY: number }[] = [];
  const offsetOf = new Map<string, { x: number; y: number }>();
  let cursorX = 0;
  for (const id of locationIds) {
    const location = getLocationById(id);
    if (!location) {
      continue;
    }
    const offset = { x: cursorX, y: 0 };
    offsetOf.set(id, offset);
    mapPlacements.push({ locationId: id, offsetX: offset.x, offsetY: offset.y });
    const local = getLocalLocationBounds(location);
    locationBounds.set(id, {
      minX: offset.x + local.minX,
      minY: offset.y + local.minY,
      maxX: offset.x + local.maxX,
      maxY: offset.y + local.maxY,
    });
    cursorX += location.map.width + MAP_GAP;
  }

  // Resolve bounds + huddle centre for every thread (in packed world space).
  for (const thread of script.threads) {
    const bounds = locationBounds.get(thread.locationId);
    if (!bounds) {
      continue;
    }
    const centre = {
      x: bounds.minX + thread.anchor.x * (bounds.maxX - bounds.minX),
      y: bounds.minY + thread.anchor.y * (bounds.maxY - bounds.minY),
    };
    const count = thread.cast.length;
    const radius = ringRadius(thread.mood, count);
    const homes = new Map<string, { x: number; y: number }>();
    thread.cast.forEach((member, index) => {
      homes.set(member.key, ringHome(index, count, centre, radius));
    });
    layouts.set(thread.id, { thread, locationId: thread.locationId, centre, radius, bounds, homes });
  }

  // Spawn each character once, just below the first thread it appears in, so it
  // walks into that huddle. Build a charset lookup from the script cast.
  const charsetByKey = new Map<string, string>();
  for (const member of script.cast) {
    charsetByKey.set(member.key, member.charset);
  }

  const definitions: CharacterDefinition[] = [];
  const spawned = new Set<string>();
  for (const thread of script.threads) {
    const layout = layouts.get(thread.id);
    if (!layout) {
      continue;
    }
    const count = thread.cast.length;
    thread.cast.forEach((member, index) => {
      if (spawned.has(member.key)) {
        return;
      }
      spawned.add(member.key);
      const home = layout.homes.get(member.key) ?? layout.centre;
      // Staggered entrances: the first member of each huddle is already standing
      // at their spot, so the others visibly WALK OVER to them — instead of the
      // whole group filing in together. Anchored members spawn AT home; the rest
      // spawn below the huddle and walk up.
      const anchored = index === 0;
      const lateral = (index - (count - 1) / 2) * ENTRANCE_SPREAD;
      const spawn = anchored
        ? { x: home.x, y: home.y }
        : {
            x: clamp(home.x + lateral, layout.bounds.minX, layout.bounds.maxX),
            y: clamp(
              layout.centre.y + layout.radius + ENTRANCE_DROP,
              layout.bounds.minY,
              layout.bounds.maxY,
            ),
          };
      const charset = charsetByKey.get(member.key) ?? member.charset ?? member.key;
      definitions.push({
        id: member.key,
        name: member.name,
        kind: CHARACTER_KINDS.npc,
        controller: CHARACTER_CONTROLLER_TYPES.script,
        position: spawn,
        appearance: { radius: BODY_RADIUS },
        movement: { mode: CHARACTER_MOVEMENT_MODES.idle, speed: WANDER_SPEED },
        sprite: {
          frameSourcePath: `charsets/sprites/${charset}`,
          displayHeight: DISPLAY_HEIGHT,
          origin: { x: 0.5, y: 1 },
          labelOffset: { x: 0, y: 0 },
        },
        traits: [],
        tags: ["episode", `loc:${thread.locationId}`],
      });
    });
  }

  // Ambient extras: non-speaking side characters who mill about a location so a
  // scene feels populated. Spawn each at its anchor (or a scattered default).
  const extras: { key: string; locationId: string; bounds: WorldBounds; behavior: "wander" | "idle" }[] = [];
  (script.extras ?? []).forEach((extra, index) => {
    const bounds = locationBounds.get(extra.locationId);
    if (!bounds || spawned.has(extra.key)) {
      return;
    }
    spawned.add(extra.key);
    const ax = extra.anchor?.x ?? 0.2 + 0.6 * (((index * 0.37) % 1));
    const ay = extra.anchor?.y ?? 0.7 + 0.2 * (((index * 0.53) % 1));
    const pos = {
      x: clamp(bounds.minX + ax * (bounds.maxX - bounds.minX), bounds.minX, bounds.maxX),
      y: clamp(bounds.minY + ay * (bounds.maxY - bounds.minY), bounds.minY, bounds.maxY),
    };
    definitions.push({
      id: extra.key,
      name: extra.name,
      kind: CHARACTER_KINDS.npc,
      controller: CHARACTER_CONTROLLER_TYPES.script,
      position: pos,
      appearance: { radius: BODY_RADIUS },
      movement: { mode: CHARACTER_MOVEMENT_MODES.idle, speed: WANDER_SPEED * 0.7 },
      sprite: {
        frameSourcePath: `charsets/sprites/${extra.charset}`,
        displayHeight: DISPLAY_HEIGHT,
        origin: { x: 0.5, y: 1 },
        labelOffset: { x: 0, y: 0 },
      },
      traits: [],
      tags: ["episode", "extra", `loc:${extra.locationId}`],
    });
    extras.push({
      key: extra.key,
      locationId: extra.locationId,
      bounds,
      behavior: extra.behavior ?? "wander",
    });
  });

  return { definitions, layouts, locationBounds, locationIds, mapPlacements, extras };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
