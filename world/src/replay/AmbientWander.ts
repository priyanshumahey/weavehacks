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
import {
  advanceStuckMovement,
  createStuckMovementTracker,
  pickEscapePoint,
  resetStuckMovementTracker,
  type StuckMovementTracker,
} from "../world/systems/stuckMovementGuard";

const ARRIVE_EPSILON = 6;
// Pause envelope, scaled per character by restlessness (restless = shorter).
const MIN_PAUSE_MS = 1600;
const MAX_PAUSE_MS = 9000;
// A new target must be at least this far from the current spot, so a character
// actually walks somewhere instead of twitching in place.
const MIN_TRAVEL = 110;
// Inset the location bounds so roamers stay off the walls/furniture margins.
const ROAM_INSET = 150;
// Random offset added to a chosen point of interest so two characters heading to
// the same landmark fan out instead of stacking.
const POI_JITTER = 44;
// A candidate POI is penalised when another roamer already stands near it, so
// the cast spreads out instead of clumping on one spot.
const CROWD_RADIUS = 120;
// While paused, glance around now and then (ms between idle look changes).
const MIN_LOOK_MS = 1400;
const MAX_LOOK_MS = 3200;

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

// Cardinal look directions for the idle "glance around".
const LOOK_DIRS: ReadonlyArray<"up" | "down" | "left" | "right"> = [
  "up",
  "down",
  "left",
  "right",
];

interface Roamer {
  locationId: string;
  target: { x: number; y: number } | null;
  last: { x: number; y: number } | null;
  pauseMs: number;
  stuck: StuckMovementTracker;
  lookMs: number;
  // Seeded personality (0..1): how soon they move on, and how far they roam.
  restlessness: number;
  stride: number;
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
        // Personality is seeded from the key so the same character always wanders
        // the same way (restless schemers pace; calm ones hold a spot).
        const h = hash(member.key);
        const restlessness = frac(h);
        const stride = frac(h * 1.37 + 0.11);
        this.roamers.set(member.key, {
          locationId,
          target: null,
          last: null,
          // Stagger the first stroll so they don't all leave at once.
          pauseMs: rand(0, MAX_PAUSE_MS),
          stuck: createStuckMovementTracker({ x: 0, y: 0 }),
          lookMs: rand(MIN_LOOK_MS, MAX_LOOK_MS),
          restlessness,
          stride,
        });
      }
    }
  }

  /** Advance every roamer one frame. Call only while the world is idle.
   *  Characters in `skip` are left to whatever has claimed them (e.g. an
   *  encounter), so they are not also driven toward a wander target. */
  update(
    runtime: WorldRuntime,
    state: WorldState,
    deltaMs: number,
    skip?: ReadonlySet<string>,
  ): void {
    for (const character of Object.values(state.characters)) {
      const roamer = this.roamers.get(character.id);
      if (!roamer) {
        continue;
      }
      if (skip?.has(character.id)) {
        // Claimed elsewhere: drop any pending target so it re-picks on release.
        roamer.target = null;
        continue;
      }

      if (roamer.target) {
        if (
          advanceStuckMovement(
            roamer.stuck,
            character.position,
            character.moveIntent,
            deltaMs,
          )
        ) {
          roamer.target = this.pickEscapeTarget(roamer, character.position, state);
          resetStuckMovementTracker(roamer.stuck, character.position);
        }

        if (this.driveTowardPoint(runtime, character.id, character.position, roamer.target)) {
          roamer.last = roamer.target;
          roamer.target = null;
          roamer.pauseMs = this.pauseFor(roamer);
          roamer.lookMs = rand(MIN_LOOK_MS, MAX_LOOK_MS);
          resetStuckMovementTracker(roamer.stuck, character.position);
        }
        continue;
      }

      resetStuckMovementTracker(roamer.stuck, character.position);

      roamer.pauseMs -= deltaMs;
      if (roamer.pauseMs > 0) {
        this.halt(runtime, character.id);
        // Glance around while idle so a paused character doesn't read as frozen.
        roamer.lookMs -= deltaMs;
        if (roamer.lookMs <= 0) {
          this.lookAround(runtime, character.id);
          roamer.lookMs = rand(MIN_LOOK_MS, MAX_LOOK_MS);
        }
        continue;
      }
      roamer.target = this.pickTarget(roamer, character.position, state);
      resetStuckMovementTracker(roamer.stuck, character.position);
    }
  }

  /** Pause length for a roamer: restless characters move on sooner. */
  private pauseFor(roamer: Roamer): number {
    const span = MAX_PAUSE_MS - MIN_PAUSE_MS;
    const base = MIN_PAUSE_MS + (1 - roamer.restlessness) * span;
    return base * (0.7 + Math.random() * 0.6);
  }

  /** Turn a paused character to a fresh cardinal direction (look around). */
  private lookAround(runtime: WorldRuntime, id: string): void {
    const dir = LOOK_DIRS[Math.floor(Math.random() * LOOK_DIRS.length)];
    runtime.dispatch(
      { type: WORLD_ACTION_TYPES.face, entityId: id, facing: dir },
      CHARACTER_CONTROLLER_TYPES.script,
    );
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

  /** Choose where a roamer strolls next: a fresh, uncrowded point of interest,
   *  weighted by the character's stride (how far they like to roam). */
  private pickTarget(
    roamer: Roamer,
    from: { x: number; y: number },
    state: WorldState,
  ): { x: number; y: number } {
    const pois = this.poisByLocation.get(roamer.locationId) ?? [];
    const bounds = this.boundsFor(roamer.locationId);

    // Other roamers' current positions, so we can avoid crowding onto them.
    const others: { x: number; y: number }[] = [];
    for (const id of this.roamers.keys()) {
      const c = state.characters[id];
      if (c && c.position !== from) {
        others.push(c.position);
      }
    }

    // Candidates: far enough to be a real walk, and not the spot just left.
    let candidates = pois.filter(
      (p) =>
        distance(p, from) >= MIN_TRAVEL &&
        (!roamer.last || distance(p, roamer.last) > 1),
    );
    if (candidates.length === 0) {
      candidates = pois.length > 0 ? pois : [from];
    }

    // Score: a wide-roaming character prefers distant points; everyone prefers
    // points no one else is standing near. Top few are sampled at random so it
    // never looks deterministic.
    const scored = candidates
      .map((p) => {
        const travel = distance(p, from);
        const crowd = others.reduce(
          (acc, o) => acc + (distance(p, o) < CROWD_RADIUS ? 1 : 0),
          0,
        );
        const strideScore = roamer.stride * travel - (1 - roamer.stride) * travel;
        return { p, score: strideScore - crowd * 240 + Math.random() * 120 };
      })
      .sort((a, b) => b.score - a.score);

    const top = scored.slice(0, Math.min(3, scored.length));
    const base = top[Math.floor(Math.random() * top.length)]?.p ?? from;
    return {
      x: clamp(base.x + jitter(), bounds.minX, bounds.maxX),
      y: clamp(base.y + jitter(), bounds.minY, bounds.maxY),
    };
  }

  /** Steer away from a blocked heading before picking another landmark. */
  private pickEscapeTarget(
    roamer: Roamer,
    from: { x: number; y: number },
    state: WorldState,
  ): { x: number; y: number } {
    const bounds = this.boundsFor(roamer.locationId);
    const blockedHeading = {
      x: roamer.stuck.blockedHeadingX,
      y: roamer.stuck.blockedHeadingY,
    };

    if (Math.hypot(blockedHeading.x, blockedHeading.y) > 0.01) {
      return pickEscapePoint(from, blockedHeading, bounds, MIN_TRAVEL * 0.65);
    }

    return this.pickTarget(roamer, from, state);
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

/** A small stable hash of a string key, for seeding per-character personality. */
function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Map an integer to a deterministic fraction in [0, 1). */
function frac(n: number): number {
  const x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}
