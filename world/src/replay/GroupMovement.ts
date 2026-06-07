// GroupMovement — drives each conversation character to and around its fixed
// slot in the huddle. Inspired by DMI's seat/sit-point model: every character
// owns one slot in the ring (computed in EnsembleStaging), walks to it on
// entrance, and holds it during the conversation, only turning to face whoever
// speaks. No free wander — that was the source of overlap and drifting spacing.
// A tiny per-character sway keeps them from looking frozen without ever
// approaching a neighbour. It only dispatches world move/face actions; the
// runtime integrates them (and the collision system keeps bodies apart).

import type { WorldRuntime } from "../world/WorldRuntime";
import type { WorldState } from "../world/worldState";
import { CHARACTER_CONTROLLER_TYPES } from "../world/worldState";
import { WORLD_ACTION_TYPES } from "../world/worldActions";
import type { GroupLayout } from "./EnsembleStaging";
import type { GroupMood } from "./ensembleTypes";
import {
  advanceStuckMovement,
  createStuckMovementTracker,
  pickEscapePoint,
  resetStuckMovementTracker,
  type StuckMovementTracker,
} from "../world/systems/stuckMovementGuard";

// Close enough to the slot to stop walking and just hold + face.
const ARRIVE_EPSILON = 4;
// Past this from the slot a character walks back (e.g. nudged by separation).
const RESETTLE_EPSILON = 10;

// Gentle idle sway around the slot, per mood — amplitude stays far below the
// body separation so it never causes overlap. Friendly bobs softly, tense is
// near-still, hostile shifts its weight a touch more.
const MOOD_SWAY: Record<GroupMood, { amp: number; speed: number }> = {
  friendly: { amp: 3.0, speed: 0.0016 },
  tense: { amp: 2.0, speed: 0.0012 },
  hostile: { amp: 4.0, speed: 0.0022 },
};

interface CharState {
  groupId: string;
  mood: GroupMood;
  home: { x: number; y: number };
  centre: { x: number; y: number };
  phase: number; // sway phase offset so groupmates don't bob in lockstep
  clock: number; // accumulated ms for the sway oscillation
  stuck: StuckMovementTracker;
  /** Short reroute when collision or bounds block the primary goal. */
  detour: { x: number; y: number } | null;
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
        this.chars.set(member.key, {
          groupId: layout.group.id,
          mood,
          home: { ...home },
          centre: { ...layout.centre },
          phase: (index / Math.max(1, layout.group.cast.length)) * Math.PI * 2,
          clock: 0,
          stuck: createStuckMovementTracker(home),
          detour: null,
        });
      });
    }
  }

  /**
   * Re-point the cast at a new act's huddles. Characters keep their world
   * position (held by the runtime) but get new homes, so they walk from their
   * old huddle to the new one — the merge/split movement between acts. Anyone
   * absent from the new act is dropped so they no longer hold a stale slot.
   */
  restage(layouts: Map<string, GroupLayout>): void {
    this.chars.clear();
    this.initFrom(layouts);
  }

  /**
   * Advance every character one frame. `speechByGroup` gives the current speaker
   * and target per group so the speaker can face its listener. While `entering`
   * is true, everyone walks from their spawn to their slot and no one speaks.
   */
  update(
    runtime: WorldRuntime,
    state: WorldState,
    deltaMs: number,
    speechByGroup: Map<string, GroupSpeech>,
    entering = false,
  ): void {
    for (const character of Object.values(state.characters)) {
      const cs = this.chars.get(character.id);
      if (!cs) {
        continue;
      }
      cs.clock += deltaMs;

      // Entrance: walk to the slot, then turn to the group and wait.
      if (entering) {
        this.maybeReroute(cs, character, deltaMs);
        const goal = cs.detour ?? cs.home;
        const arrived = this.driveTowardPoint(runtime, character.id, character.position, goal);
        if (arrived) {
          if (cs.detour) {
            cs.detour = null;
            resetStuckMovementTracker(cs.stuck, character.position);
          } else {
            const faceKey = this.otherInGroup(character.id, cs, state);
            if (faceKey && state.characters[faceKey]) {
              this.face(runtime, character.id, faceKey);
            }
          }
        }
        continue;
      }

      // Conversation: hold the slot (return to it if nudged), gently swaying,
      // and face whoever is speaking — or a groupmate when nobody speaks.
      const speech = speechByGroup.get(cs.groupId);
      const slot = this.swayTarget(cs);
      const dist = distance(character.position, slot);
      if (dist > RESETTLE_EPSILON) {
        this.maybeReroute(cs, character, deltaMs);
        const goal = cs.detour ?? slot;
        this.driveTowardPoint(runtime, character.id, character.position, goal);
        if (cs.detour && distance(character.position, cs.detour) <= ARRIVE_EPSILON) {
          cs.detour = null;
          resetStuckMovementTracker(cs.stuck, character.position);
        }
      } else {
        cs.detour = null;
        resetStuckMovementTracker(cs.stuck, character.position);
        this.halt(runtime, character.id);
      }

      const faceKey = this.faceTarget(character.id, cs, speech, state);
      if (faceKey && state.characters[faceKey]) {
        this.face(runtime, character.id, faceKey);
      }
    }
  }

  /** Who a character should look at: the speaker, their target, or a neighbour. */
  private faceTarget(
    id: string,
    cs: CharState,
    speech: GroupSpeech | undefined,
    state: WorldState,
  ): string | null {
    if (speech?.speaker === id) {
      return speech.target && state.characters[speech.target]
        ? speech.target
        : this.otherInGroup(id, cs, state);
    }
    if (speech?.speaker && state.characters[speech.speaker]) {
      return speech.speaker;
    }
    return this.otherInGroup(id, cs, state);
  }

  private maybeReroute(
    cs: CharState,
    character: { position: { x: number; y: number }; moveIntent: { x: number; y: number } },
    deltaMs: number,
  ): void {
    if (
      !advanceStuckMovement(cs.stuck, character.position, character.moveIntent, deltaMs)
    ) {
      return;
    }

    cs.detour = pickEscapePoint(
      character.position,
      { x: cs.stuck.blockedHeadingX, y: cs.stuck.blockedHeadingY },
      this.localBounds(cs),
      70,
    );
    resetStuckMovementTracker(cs.stuck, character.position);
  }

  private localBounds(cs: CharState): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    const pad = 220;
    return {
      minX: cs.centre.x - pad,
      minY: cs.centre.y - pad,
      maxX: cs.centre.x + pad,
      maxY: cs.centre.y + pad,
    };
  }

  /** The slot plus a small mood-flavoured oscillation (never near a neighbour). */
  private swayTarget(cs: CharState): { x: number; y: number } {
    const sway = MOOD_SWAY[cs.mood];
    const t = cs.clock * sway.speed + cs.phase;
    return {
      x: cs.home.x + Math.cos(t) * sway.amp,
      y: cs.home.y + Math.sin(t * 0.8) * sway.amp,
    };
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

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
