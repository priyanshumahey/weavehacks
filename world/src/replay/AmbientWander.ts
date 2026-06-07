// AmbientWander — keeps the world alive after a scene settles. Once the
// conversation is over, characters break from their huddle and roam their
// location with purpose: stroll to a point of interest, pause to "take in the
// room", then pick another. Pure client-side (no LLM, no backend) and cheap —
// it runs every frame off a few timers. Facing follows the direction of travel
// (the animation system derives it from move intent), and the collision system
// keeps bodies apart, so wanderers never overlap.
//
// This is also the substrate for spontaneous encounters (P3): two roamers that
// drift within range of each other are exactly the trigger we will watch for.

import type { WorldRuntime } from "../world/WorldRuntime";
import type { WorldBounds, WorldState } from "../world/worldState";
import { CHARACTER_CONTROLLER_TYPES } from "../world/worldState";
import { WORLD_ACTION_TYPES } from "../world/worldActions";
import { getLocalLocationBounds } from "../rendering/world/locationBounds";
import {
  getLocationById,
  winterfellWorldLayout,
} from "../data/locations/winterfellWorldLayout";
import { LOCATION_IDS } from "../types/location";
import type { EnsembleStaging } from "./EnsembleStaging";

const ARRIVE_EPSILON = 6;
const MIN_PAUSE_MS = 2200;
const MAX_PAUSE_MS = 6000;
// A new target must be at least this far from the current spot, so a character
// actually walks somewhere instead of twitching in place.
const MIN_TRAVEL = 110;
// Inset the location bounds so roamers stay off the walls/furniture margins.
const ROAM_INSET = 150;
// Random offset added to a chosen point of interest so groupmates heading to the
// same landmark fan out instead of stacking.
const POI_JITTER = 44;

// Normalized points of interest across a location (0..1). A loose scatter that
// reads as "places worth standing" — corners, the middle of the floor, etc.
const POI_ANCHORS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0.26, y: 0.3 },
  { x: 0.5, y: 0.22 },
  { x: 0.74, y: 0.32 },
  { x: 0.3, y: 0.54 },
  { x: 0.7, y: 0.56 },
  { x: 0.5, y: 0.46 },
  { x: 0.24, y: 0.76 },
  { x: 0.5, y: 0.72 },
  { x: 0.76, y: 0.78 },
];

interface Roamer {
  locationId: string;
  target: { x: number; y: number } | null;
  pauseMs: number;
}

export class AmbientWander {
  private readonly roamers = new Map<string, Roamer>();
  /** location id -> world-space points of interest. */
  private readonly poisByLocation = new Map<string, { x: number; y: number }[]>();

  initFrom(staging: EnsembleStaging): void {
    this.roamers.clear();
    for (const layout of staging.layouts.values()) {
      const locationId =
        layout.group.locationId ?? winterfellWorldLayout.defaultLocationId;
      this.ensurePois(locationId);
      for (const member of layout.group.cast) {
        this.roamers.set(member.key, {
          locationId,
          target: null,
          // Stagger the first stroll so they don't all leave at once.
          pauseMs: rand(0, MAX_PAUSE_MS),
        });
      }
    }
  }

  /** Advance every roamer one frame. Call only while the world is idle. */
  update(runtime: WorldRuntime, state: WorldState, deltaMs: number): void {
    for (const character of Object.values(state.characters)) {
      const roamer = this.roamers.get(character.id);
      if (!roamer) {
        continue;
      }

      if (roamer.target) {
        if (this.driveTowardPoint(runtime, character.id, character.position, roamer.target)) {
          roamer.target = null;
          roamer.pauseMs = rand(MIN_PAUSE_MS, MAX_PAUSE_MS);
        }
        continue;
      }

      roamer.pauseMs -= deltaMs;
      if (roamer.pauseMs > 0) {
        this.halt(runtime, character.id);
        continue;
      }
      roamer.target = this.pickTarget(roamer.locationId, character.position);
    }
  }

  private ensurePois(locationId: string): void {
    if (this.poisByLocation.has(locationId)) {
      return;
    }
    const location =
      getLocationById(locationId) ?? getLocationById(LOCATION_IDS.throneRoom);
    if (!location) {
      this.poisByLocation.set(locationId, []);
      return;
    }
    const bounds = getLocalLocationBounds(location, ROAM_INSET);
    const pois = POI_ANCHORS.map((a) => ({
      x: bounds.minX + a.x * (bounds.maxX - bounds.minX),
      y: bounds.minY + a.y * (bounds.maxY - bounds.minY),
    }));
    this.poisByLocation.set(locationId, pois);
  }

  /** A point of interest at least MIN_TRAVEL away, with a little jitter. */
  private pickTarget(
    locationId: string,
    from: { x: number; y: number },
  ): { x: number; y: number } {
    const pois = this.poisByLocation.get(locationId) ?? [];
    const bounds = this.boundsFor(locationId);
    const far = pois.filter((p) => distance(p, from) >= MIN_TRAVEL);
    const pool = far.length > 0 ? far : pois;
    const base =
      pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : from;
    return {
      x: clamp(base.x + jitter(), bounds.minX, bounds.maxX),
      y: clamp(base.y + jitter(), bounds.minY, bounds.maxY),
    };
  }

  private boundsFor(locationId: string): WorldBounds {
    const location =
      getLocationById(locationId) ?? getLocationById(LOCATION_IDS.throneRoom);
    return location
      ? getLocalLocationBounds(location, ROAM_INSET)
      : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  /** Drive an entity toward a point; returns true (and halts) once arrived. */
  private driveTowardPoint(
    runtime: WorldRuntime,
    id: string,
    pos: { x: number; y: number },
    point: { x: number; y: number },
  ): boolean {
    const dx = point.x - pos.x;
    const dy = point.y - pos.y;
    if (Math.hypot(dx, dy) <= ARRIVE_EPSILON) {
      this.halt(runtime, id);
      return true;
    }
    runtime.dispatch(
      { type: WORLD_ACTION_TYPES.move, entityId: id, intent: { x: dx, y: dy } },
      CHARACTER_CONTROLLER_TYPES.script,
    );
    return false;
  }

  private halt(runtime: WorldRuntime, id: string): void {
    runtime.dispatch(
      { type: WORLD_ACTION_TYPES.move, entityId: id, intent: { x: 0, y: 0 } },
      CHARACTER_CONTROLLER_TYPES.script,
    );
  }
}

function jitter(): number {
  return (Math.random() * 2 - 1) * POI_JITTER;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
