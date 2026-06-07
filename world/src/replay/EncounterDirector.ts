// EncounterDirector — plays the precomputed mingle. After the staged scenes
// settle and the cast disperses, this stages each baked encounter in turn: it
// walks the two characters together (so it reads as if they wandered into each
// other), plays their short exchange in place, then releases them back to
// roaming. Everything is precomputed on the backend, so this is pure
// choreography + playback — no live LLM, deterministic, and saved with the
// scene for instant replay.
//
// It dispatches world move/face actions directly (like GroupMovement) and tells
// the scene which characters it has "claimed" so AmbientWander skips them while
// they meet.

import type { WorldRuntime } from "../world/WorldRuntime";
import type { WorldState } from "../world/worldState";
import { CHARACTER_CONTROLLER_TYPES } from "../world/worldState";
import { WORLD_ACTION_TYPES } from "../world/worldActions";
import type { EnsembleEncounter, EnsembleTurn } from "./ensembleTypes";

const ARRIVE_EPSILON = 6;
// Half the centre-to-centre gap the pair stands at while talking.
const HALF_GAP = 30;
const BEAT_MS = 5200; // one spoken line of an encounter
const COOLDOWN_MS = 4200; // breath between meetings
const FIRST_DELAY_MS = 3500; // let the cast disperse before the first meeting
const GATHER_TIMEOUT_MS = 14000; // safety: don't get stuck walking together

type Phase = "cooldown" | "gathering" | "talking";

interface Active {
  encounter: EnsembleEncounter;
  aKey: string;
  bKey: string;
  aTarget: { x: number; y: number };
  bTarget: { x: number; y: number };
  clock: number; // ms accumulated in the current phase
}

export interface EncounterSpeech {
  speaker: string | null;
  turn: EnsembleTurn | null;
}

export class EncounterDirector {
  private readonly queue: EnsembleEncounter[];
  private index = 0;
  private phase: Phase = "cooldown";
  private cooldownMs = FIRST_DELAY_MS;
  private active: Active | null = null;

  constructor(encounters: EnsembleEncounter[] | undefined) {
    // Only encounters whose two characters both have turns are playable.
    this.queue = (encounters ?? []).filter(
      (e) => e.cast.length >= 2 && e.turns.length > 0,
    );
  }

  get hasWork(): boolean {
    return this.index < this.queue.length || this.active !== null;
  }

  /** Characters currently committed to a meeting (AmbientWander skips these). */
  claimed(): Set<string> {
    if (!this.active) {
      return EMPTY;
    }
    return new Set([this.active.aKey, this.active.bKey]);
  }

  /** The speaker + turn to render right now, or nulls when no one is speaking. */
  speech(): EncounterSpeech {
    if (!this.active || this.phase !== "talking") {
      return { speaker: null, turn: null };
    }
    const beat = Math.floor(this.active.clock / BEAT_MS);
    const turn = this.active.encounter.turns[beat] ?? null;
    if (!turn || !turn.dialogue.trim() || turn.dialogue.trim() === "...") {
      return { speaker: null, turn: null };
    }
    return { speaker: turn.speaker, turn };
  }

  update(runtime: WorldRuntime, state: WorldState, deltaMs: number): void {
    if (this.phase === "cooldown") {
      this.cooldownMs -= deltaMs;
      if (this.cooldownMs <= 0) {
        this.beginNext(state);
      }
      return;
    }

    if (!this.active) {
      return;
    }
    this.active.clock += deltaMs;

    if (this.phase === "gathering") {
      this.driveGathering(runtime, state);
      return;
    }

    // talking: hold position, face each other, advance by beat.
    this.faceEachOther(runtime, state);
    this.halt(runtime, this.active.aKey);
    this.halt(runtime, this.active.bKey);
    const totalMs = this.active.encounter.turns.length * BEAT_MS;
    if (this.active.clock >= totalMs) {
      this.active = null;
      this.index += 1;
      this.phase = "cooldown";
      this.cooldownMs = COOLDOWN_MS;
    }
  }

  private beginNext(state: WorldState): void {
    while (this.index < this.queue.length) {
      const encounter = this.queue[this.index];
      const aKey = encounter.cast[0]?.key;
      const bKey = encounter.cast[1]?.key;
      const a = aKey ? state.characters[aKey] : undefined;
      const b = bKey ? state.characters[bKey] : undefined;
      if (!a || !b) {
        this.index += 1; // a character isn't present; skip this meeting
        continue;
      }
      // Meet at the midpoint of where they are now, standing a body apart on the
      // axis between them so they face each other.
      const cx = (a.position.x + b.position.x) / 2;
      const cy = (a.position.y + b.position.y) / 2;
      let nx = a.position.x - b.position.x;
      let ny = a.position.y - b.position.y;
      const len = Math.hypot(nx, ny) || 1;
      nx /= len;
      ny /= len;
      this.active = {
        encounter,
        aKey: aKey!,
        bKey: bKey!,
        aTarget: { x: cx + nx * HALF_GAP, y: cy + ny * HALF_GAP },
        bTarget: { x: cx - nx * HALF_GAP, y: cy - ny * HALF_GAP },
        clock: 0,
      };
      this.phase = "gathering";
      return;
    }
    // Queue exhausted: nothing more to stage; remain idle.
    this.phase = "cooldown";
    this.cooldownMs = Number.POSITIVE_INFINITY;
  }

  private driveGathering(runtime: WorldRuntime, state: WorldState): void {
    const act = this.active!;
    const a = state.characters[act.aKey];
    const b = state.characters[act.bKey];
    if (!a || !b) {
      this.active = null;
      this.index += 1;
      this.phase = "cooldown";
      this.cooldownMs = COOLDOWN_MS;
      return;
    }
    const aArrived = this.driveTowardPoint(runtime, act.aKey, a.position, act.aTarget);
    const bArrived = this.driveTowardPoint(runtime, act.bKey, b.position, act.bTarget);
    // Don't face while walking — a face action zeroes the move intent, which
    // would freeze them in place. Facing follows travel direction; they turn to
    // each other once they have arrived (the talking phase handles that).
    if ((aArrived && bArrived) || act.clock >= GATHER_TIMEOUT_MS) {
      this.halt(runtime, act.aKey);
      this.halt(runtime, act.bKey);
      this.faceEachOther(runtime, state);
      this.phase = "talking";
      act.clock = 0;
    }
  }

  private faceEachOther(runtime: WorldRuntime, state: WorldState): void {
    const act = this.active!;
    if (state.characters[act.aKey] && state.characters[act.bKey]) {
      this.face(runtime, act.aKey, act.bKey);
      this.face(runtime, act.bKey, act.aKey);
    }
  }

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
}

const EMPTY: Set<string> = new Set();
