// GroupMovement — gives each conversation group its own physical character. The
// mood authored in the ensemble becomes motion:
//   • friendly — a tight, gently swaying huddle, all turned to the speaker.
//   • tense    — a wary ring that holds its ground and faces whoever speaks.
//   • hostile  — restless pacing: the two orbit the centre and drift toward and
//                away from each other, never quite settling.
// It only dispatches world move/face actions; the runtime integrates them.

import type { WorldRuntime } from "../world/WorldRuntime";
import type { WorldState } from "../world/worldState";
import { CHARACTER_CONTROLLER_TYPES } from "../world/worldState";
import { WORLD_ACTION_TYPES } from "../world/worldActions";
import type { GroupLayout } from "./EnsembleStaging";
import type { GroupMood } from "./ensembleTypes";

const ARRIVE_EPSILON = 5;

// Per-mood wander: how far a character roams from its home, and how long it
// pauses between strolls. Listeners mostly stand and face the speaker; the long
// pauses keep them from spinning between random targets.
const MOOD_WANDER: Record<GroupMood, { radius: number; minPause: number; maxPause: number }> = {
  friendly: { radius: 6, minPause: 4500, maxPause: 9000 },
  tense: { radius: 5, minPause: 5500, maxPause: 11000 },
  hostile: { radius: 18, minPause: 1800, maxPause: 3600 },
};

const HOSTILE_ORBIT_SPEED = 0.00011; // radians per ms (slow, wary circling)

interface CharState {
  groupId: string;
  mood: GroupMood;
  home: { x: number; y: number };
  centre: { x: number; y: number };
  target: { x: number; y: number } | null;
  pauseMs: number;
  orbit: number; // current angle around the centre (hostile)
}

export interface GroupSpeech {
  /** Current speaker key for the group, or null. */
  speaker: string | null;
  /** The speaker's target key, or null. */
  target: string | null;
}

export class GroupMovement {
  private readonly chars = new Map<string, CharState>();

  initFrom(layouts: Map<string, GroupLayout>): void {
    for (const layout of layouts.values()) {
      const mood = layout.group.mood;
      layout.group.cast.forEach((member, index) => {
        const home = layout.homes.get(member.key) ?? layout.centre;
        const orbit =
          -Math.PI / 2 + (index / Math.max(1, layout.group.cast.length)) * Math.PI * 2;
        this.chars.set(member.key, {
          groupId: layout.group.id,
          mood,
          home: { ...home },
          centre: { ...layout.centre },
          target: null,
          pauseMs: rand(MOOD_WANDER[mood].minPause, MOOD_WANDER[mood].maxPause),
          orbit,
        });
      });
    }
  }

  /**
   * Advance every character one frame. `speechByGroup` gives the current speaker
   * and target per group so the speaker can stop and face its listener.
   */
  update(
    runtime: WorldRuntime,
    state: WorldState,
    deltaMs: number,
    speechByGroup: Map<string, GroupSpeech>,
  ): void {
    for (const character of Object.values(state.characters)) {
      const cs = this.chars.get(character.id);
      if (!cs) {
        continue;
      }
      const speech = speechByGroup.get(cs.groupId);
      const isSpeaker = speech?.speaker === character.id;

      if (isSpeaker) {
        this.halt(runtime, character.id);
        const faceKey = speech?.target ?? this.otherInGroup(character.id, cs, state);
        if (faceKey && state.characters[faceKey]) {
          this.face(runtime, character.id, faceKey);
        }
        cs.target = null;
        continue;
      }

      // Someone in this group is speaking: a listener stands still and watches.
      // (No wander while being talked to — that is what caused the spinning.)
      if (speech?.speaker && state.characters[speech.speaker]) {
        this.halt(runtime, character.id);
        this.face(runtime, character.id, speech.speaker);
        cs.target = null;
        continue;
      }

      // Nobody is speaking in this group right now: gentle idle drift.
      if (cs.mood === "hostile") {
        this.paceStep(runtime, character.id, character.position, cs, deltaMs);
      } else {
        this.strollStep(runtime, character.id, character.position, cs, deltaMs);
      }
    }
  }

  private strollStep(
    runtime: WorldRuntime,
    id: string,
    pos: { x: number; y: number },
    cs: CharState,
    deltaMs: number,
  ): void {
    if (!cs.target) {
      cs.pauseMs -= deltaMs;
      if (cs.pauseMs > 0) {
        this.halt(runtime, id);
        return;
      }
      cs.target = wanderTarget(cs.home, MOOD_WANDER[cs.mood].radius);
    }
    this.driveToward(runtime, id, pos, cs);
  }

  private paceStep(
    runtime: WorldRuntime,
    id: string,
    pos: { x: number; y: number },
    cs: CharState,
    deltaMs: number,
  ): void {
    // Orbit the centre, occasionally lunging toward or away from it.
    cs.orbit += HOSTILE_ORBIT_SPEED * deltaMs;
    if (!cs.target) {
      cs.pauseMs -= deltaMs;
      if (cs.pauseMs > 0) {
        // Keep edging along the orbit even while "paused".
        const r = MOOD_WANDER.hostile.radius;
        cs.target = {
          x: cs.centre.x + Math.cos(cs.orbit) * (r + 30),
          y: cs.centre.y + Math.sin(cs.orbit) * (r + 30),
        };
      } else {
        const lunge = Math.random() < 0.5 ? 12 : 54;
        cs.target = {
          x: cs.centre.x + Math.cos(cs.orbit) * lunge,
          y: cs.centre.y + Math.sin(cs.orbit) * lunge,
        };
        cs.pauseMs = rand(MOOD_WANDER.hostile.minPause, MOOD_WANDER.hostile.maxPause);
      }
    }
    this.driveToward(runtime, id, pos, cs);
  }

  private driveToward(
    runtime: WorldRuntime,
    id: string,
    pos: { x: number; y: number },
    cs: CharState,
  ): void {
    if (!cs.target) {
      this.halt(runtime, id);
      return;
    }
    const dx = cs.target.x - pos.x;
    const dy = cs.target.y - pos.y;
    if (Math.hypot(dx, dy) <= ARRIVE_EPSILON) {
      cs.target = null;
      this.halt(runtime, id);
      return;
    }
    runtime.dispatch(
      { type: WORLD_ACTION_TYPES.move, entityId: id, intent: { x: dx, y: dy } },
      CHARACTER_CONTROLLER_TYPES.script,
    );
  }

  private halt(runtime: WorldRuntime, id: string): void {
    runtime.dispatch(
      { type: WORLD_ACTION_TYPES.move, entityId: id, intent: { x: 0, y: 0 } },
      CHARACTER_CONTROLLER_TYPES.script,
    );
  }

  private face(runtime: WorldRuntime, id: string, targetId: string): void {
    runtime.dispatch(
      { type: WORLD_ACTION_TYPES.face, entityId: id, targetEntityId: targetId },
      CHARACTER_CONTROLLER_TYPES.script,
    );
  }

  /** The nearest groupmate of `selfId` to face when no explicit target. */
  private otherInGroup(selfId: string, cs: CharState, state: WorldState): string | null {
    const self = state.characters[selfId];
    if (!self) {
      return null;
    }
    let best: { key: string; dist: number } | null = null;
    for (const [key, other] of this.chars) {
      if (other.groupId !== cs.groupId || key === selfId) {
        continue;
      }
      const c = state.characters[key];
      if (!c) {
        continue;
      }
      const dist = Math.hypot(c.position.x - self.position.x, c.position.y - self.position.y);
      if (!best || dist < best.dist) {
        best = { key, dist };
      }
    }
    return best?.key ?? null;
  }
}

function wanderTarget(
  home: { x: number; y: number },
  radius: number,
): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const r = Math.random() * radius;
  return { x: home.x + Math.cos(angle) * r, y: home.y + Math.sin(angle) * r };
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
