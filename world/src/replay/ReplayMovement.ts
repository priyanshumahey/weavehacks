// ReplayMovement — gives replay characters ambient life. Each character strolls
// to nearby points around its spawn "home"; the active speaker stops and faces
// the character it is addressing so the eye is drawn to who is talking. This is
// presentation-driving-state: it only dispatches world actions (move/face) and
// lets the runtime's movement/animation systems do the actual integration.

import type { WorldRuntime } from "../world/WorldRuntime";
import type { WorldBounds, WorldState } from "../world/worldState";
import { CHARACTER_CONTROLLER_TYPES } from "../world/worldState";
import { WORLD_ACTION_TYPES } from "../world/worldActions";

const WANDER_RADIUS = 10; // how far from home a stroll target may be (tight huddle)
const ARRIVE_EPSILON = 6; // within this distance, the target is "reached"
const MIN_PAUSE_MS = 700;
const MAX_PAUSE_MS = 2600;
const HUDDLE_RADIUS = 52; // tight conversation huddle radius (px)

interface WanderState {
  home: { x: number; y: number };
  target: { x: number; y: number } | null;
  pauseMs: number;
}

export class ReplayMovement {
  private readonly wander = new Map<string, WanderState>();
  private lastHuddle: { x: number; y: number } | null = null;

  /** The centre of the most recent staged huddle, if any. */
  huddleCentre(): { x: number; y: number } | null {
    return this.lastHuddle;
  }

  /** Snapshot each character's spawn position as its wander home. */
  initFrom(state: WorldState): void {
    for (const character of Object.values(state.characters)) {
      this.wander.set(character.id, {
        home: { x: character.position.x, y: character.position.y },
        target: null,
        pauseMs: rand(MIN_PAUSE_MS, MAX_PAUSE_MS),
      });
    }
  }

  /**
   * Re-home the current scene's cast into a tight huddle near the playfield
   * centre, so characters gather around whoever they are addressing. Characters
   * not in the scene keep their existing homes (they drift at the edges).
   */
  stageScene(sceneCast: string[], bounds: WorldBounds): { x: number; y: number } | null {
    const present = sceneCast.filter((key) => this.wander.has(key));
    if (present.length === 0) {
      return null;
    }
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const radius = present.length <= 1 ? 0 : HUDDLE_RADIUS;

    present.forEach((key, index) => {
      const angle = -Math.PI / 2 + (index / present.length) * Math.PI * 2;
      const w = this.wander.get(key);
      if (w) {
        w.home = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
        w.target = { ...w.home }; // walk toward the new huddle spot
      }
    });
    this.lastHuddle = { x: cx, y: cy };
    return { x: cx, y: cy };
  }


  /**
   * Advance ambient motion one frame. The current speaker (if any) halts and
   * faces its target; everyone else strolls.
   */
  update(
    runtime: WorldRuntime,
    state: WorldState,
    deltaMs: number,
    speakerKey: string | null,
    speakerTargetKey: string | null,
  ): void {
    for (const character of Object.values(state.characters)) {
      const w = this.wander.get(character.id);
      if (!w) {
        continue;
      }

      if (character.id === speakerKey) {
        // Stop and turn toward whoever is being addressed.
        runtime.dispatch(
          { type: WORLD_ACTION_TYPES.move, entityId: character.id, intent: { x: 0, y: 0 } },
          CHARACTER_CONTROLLER_TYPES.script,
        );
        if (speakerTargetKey && state.characters[speakerTargetKey]) {
          runtime.dispatch(
            {
              type: WORLD_ACTION_TYPES.face,
              entityId: character.id,
              targetEntityId: speakerTargetKey,
            },
            CHARACTER_CONTROLLER_TYPES.script,
          );
        }
        w.target = null;
        continue;
      }

      this.strollStep(runtime, character.id, character.position, w, deltaMs);
    }
  }

  private strollStep(
    runtime: WorldRuntime,
    id: string,
    position: { x: number; y: number },
    w: WanderState,
    deltaMs: number,
  ): void {
    if (!w.target) {
      w.pauseMs -= deltaMs;
      if (w.pauseMs > 0) {
        runtime.dispatch(
          { type: WORLD_ACTION_TYPES.move, entityId: id, intent: { x: 0, y: 0 } },
          CHARACTER_CONTROLLER_TYPES.script,
        );
        return;
      }
      w.target = pickTarget(w.home);
    }

    const dx = w.target.x - position.x;
    const dy = w.target.y - position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= ARRIVE_EPSILON) {
      w.target = null;
      w.pauseMs = rand(MIN_PAUSE_MS, MAX_PAUSE_MS);
      runtime.dispatch(
        { type: WORLD_ACTION_TYPES.move, entityId: id, intent: { x: 0, y: 0 } },
        CHARACTER_CONTROLLER_TYPES.script,
      );
      return;
    }

    runtime.dispatch(
      { type: WORLD_ACTION_TYPES.move, entityId: id, intent: { x: dx, y: dy } },
      CHARACTER_CONTROLLER_TYPES.script,
    );
  }
}

function pickTarget(home: { x: number; y: number }): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * WANDER_RADIUS;
  return {
    x: home.x + Math.cos(angle) * radius,
    y: home.y + Math.sin(angle) * radius,
  };
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
