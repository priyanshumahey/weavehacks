// ContinuousTimeline — the scheduler that turns a flat list of THREADS into the
// living, staggered, multi-map performance. One continuous wall clock; each
// thread runs its own little state machine:
//
//   pending  — waiting for its dependencies to finish (deps = earlier threads
//              its cast was in, so a character is never in two at once)
//   gathering— its cast walk from wherever they are to their huddle homes
//   talking  — everyone has arrived; the thread plays its turns, one per beat
//   done     — turns exhausted; the cast are released (they idle, then a later
//              thread may pull them, or they drift off the map edge for good)
//
// Because threads have different turn counts and different dependency chains,
// conversations begin and END at different times — the staggered, "feels random
// but is fully scripted" behaviour. The timeline only dispatches world move/face
// actions (like GroupMovement / EncounterDirector); the runtime integrates them.

import type { WorldRuntime } from "../world/WorldRuntime";
import type { WorldState } from "../world/worldState";
import { CHARACTER_CONTROLLER_TYPES } from "../world/worldState";
import { WORLD_ACTION_TYPES } from "../world/worldActions";
import type { EnsembleTurn } from "./ensembleTypes";
import type { EpisodeScript, ScriptThread } from "./episodeScriptTypes";
import type { EpisodeScriptStaging, ThreadLayout } from "./EpisodeScriptStaging";

const BEAT_MS = 7000; // wall-clock duration of one spoken turn
const SETTLE_MS = 1400; // pause after a thread's last line before it is "done"
const GATHER_TIMEOUT_MS = 16000; // safety: start talking even if someone is stuck
const ARRIVE_EPSILON = 8;
const RELEASE_IDLE_MS = 2600; // how long a freed character lingers before drifting
// How far inside a map's bottom edge a departing character walks before being
// removed (their body radius keeps them on-map; the scene then deletes them).
const BODY_EDGE_INSET = 26;
const EXIT_ARRIVE_EPSILON = 10;
// A pending thread waits a randomized beat before it begins gathering, so the
// opening conversations stagger (some huddles form first, others a moment
// later) instead of every group starting in lockstep.
const STAGGER_MIN_MS = 0;
const STAGGER_MAX_MS = 6500;
// Later threads (after their dependencies finish) also wait a shorter random
// beat, so a freed character pauses, then walks into their next conversation —
// the threads desync instead of all reconvening at once.
const LATER_STAGGER_MIN_MS = 600;
const LATER_STAGGER_MAX_MS = 5000;

type ThreadPhase = "pending" | "gathering" | "talking" | "done";

interface ThreadRuntime {
  thread: ScriptThread;
  layout: ThreadLayout;
  phase: ThreadPhase;
  clock: number; // ms accumulated in the current phase
  /** ms a ready (deps-met) thread waits before gathering — staggers entrances. */
  startDelay: number;
  /** ms accumulated while ready-but-waiting. */
  readyClock: number;
}

/** What a single character is doing right now (for movement + the camera). */
interface CharStatus {
  /** The thread currently holding this character, or null when free. */
  threadId: string | null;
  /** ms this character has been free (idle) since their last thread ended. */
  freeMs: number;
  /** True once the character has fully walked off the map edge. */
  departed: boolean;
}

export interface ThreadSpeech {
  threadId: string;
  locationId: string;
  speaker: string;
  turn: EnsembleTurn;
}

export class ContinuousTimeline {
  private readonly threads: ThreadRuntime[] = [];
  private readonly byId = new Map<string, ThreadRuntime>();
  private readonly status = new Map<string, CharStatus>();
  /** Character key -> any layout that contains them (their map is fixed). */
  private readonly layoutOf = new Map<string, ThreadLayout>();
  /** Characters that have fully walked off the map this frame (to remove). */
  private readonly justDeparted = new Set<string>();
  /** Ambient extras and their lightweight wander state. */
  private readonly extras = new Map<
    string,
    { bounds: { minX: number; minY: number; maxX: number; maxY: number }; behavior: "wander" | "idle"; target: { x: number; y: number } | null; pauseMs: number }
  >();
  /** Linger state for cast members between conversations (wander near their map). */
  private readonly linger = new Map<
    string,
    { target: { x: number; y: number } | null; pauseMs: number }
  >();
  private playing = true;

  constructor(
    private readonly script: EpisodeScript,
    private readonly staging: EpisodeScriptStaging,
  ) {
    for (const thread of script.threads) {
      const layout = staging.layouts.get(thread.id);
      if (!layout) {
        continue;
      }
      // Every thread waits a randomized beat after its dependencies clear before
      // it begins gathering, so conversations never start (or finish) in
      // lockstep — one huddle forms, another a moment later, a third after that.
      // Phase-0 openers stagger more widely so the scene eases in.
      const startDelay =
        thread.phase === 0
          ? STAGGER_MIN_MS + Math.random() * (STAGGER_MAX_MS - STAGGER_MIN_MS)
          : LATER_STAGGER_MIN_MS +
            Math.random() * (LATER_STAGGER_MAX_MS - LATER_STAGGER_MIN_MS);
      const rt: ThreadRuntime = {
        thread,
        layout,
        phase: "pending",
        clock: 0,
        startDelay,
        readyClock: 0,
      };
      this.threads.push(rt);
      this.byId.set(thread.id, rt);
    }
    for (const member of script.cast) {
      this.status.set(member.key, { threadId: null, freeMs: 0, departed: false });
    }
    // A character's map never changes, so cache any layout that contains them —
    // used to resolve their map's bounds when they drift off the edge.
    for (const layout of staging.layouts.values()) {
      for (const member of layout.thread.cast) {
        if (!this.layoutOf.has(member.key)) {
          this.layoutOf.set(member.key, layout);
        }
      }
    }
    // Ambient extras: register their wander state (they have no thread).
    for (const extra of staging.extras) {
      this.extras.set(extra.key, {
        bounds: extra.bounds,
        behavior: extra.behavior,
        target: null,
        pauseMs: Math.random() * 3000,
      });
    }
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
  }

  togglePlaying(): void {
    this.playing = !this.playing;
  }

  /** True once every thread is done (the episode has fully played out). */
  get atEnd(): boolean {
    return this.threads.every((t) => t.phase === "done");
  }

  /** Fraction of threads complete — a coarse progress signal for the slider. */
  get progress(): number {
    if (this.threads.length === 0) {
      return 1;
    }
    const done = this.threads.filter((t) => t.phase === "done").length;
    const talking = this.threads.filter((t) => t.phase === "talking");
    let partial = 0;
    for (const t of talking) {
      const beats = Math.max(1, t.thread.turns.length);
      partial += Math.min(1, t.clock / (beats * BEAT_MS));
    }
    return (done + partial) / this.threads.length;
  }

  progressLabel(): string {
    const active = this.threads.filter((t) => t.phase === "talking").length;
    const gathering = this.threads.filter((t) => t.phase === "gathering").length;
    const done = this.threads.filter((t) => t.phase === "done").length;
    return `${active} talking · ${gathering} gathering · ${done}/${this.threads.length} done`;
  }

  /** Threads currently in the talking phase (drives the debug overlay). */
  activeThreads(): ScriptThread[] {
    return this.threads.filter((t) => t.phase === "talking").map((t) => t.thread);
  }

  /** Per-character phase, for the debug overlay. */
  threadPhaseOf(threadId: string): ThreadPhase | null {
    return this.byId.get(threadId)?.phase ?? null;
  }

  /** The thread a character is currently committed to (gathering or talking),
   *  or null when they are free/idle. Used so clicking a character follows the
   *  whole conversation, not just that one speaker. */
  threadOfCharacter(key: string): string | null {
    const st = this.status.get(key);
    if (st?.threadId) {
      return st.threadId;
    }
    // Not yet committed: if a single talking thread contains them, use it.
    for (const rt of this.threads) {
      if (rt.phase === "talking" && rt.thread.cast.some((m) => m.key === key)) {
        return rt.thread.id;
      }
    }
    return null;
  }

  /** The current speech for a specific thread (speaker + line), or null. */
  speechForThread(threadId: string): ThreadSpeech | null {
    return this.currentSpeech().find((s) => s.threadId === threadId) ?? null;
  }

  /** A thread's cast (keys), for the focus panel. */
  castOfThread(threadId: string): string[] {
    return this.byId.get(threadId)?.thread.cast.map((m) => m.key) ?? [];
  }

  /** Whether a thread is still active (gathering or talking). */
  isThreadActive(threadId: string): boolean {
    const phase = this.byId.get(threadId)?.phase;
    return phase === "gathering" || phase === "talking";
  }

  /** Advance the whole episode one frame and drive all movement. */
  update(runtime: WorldRuntime, state: WorldState, deltaMs: number): void {
    if (!this.playing) {
      return;
    }

    // 1) Promote pending threads whose dependencies are all done AND whose cast
    //    are all currently free (not held by another thread). A ready thread
    //    waits out its startDelay first, so opening huddles form in a stagger.
    for (const rt of this.threads) {
      if (rt.phase !== "pending") {
        continue;
      }
      if (!this.dependenciesDone(rt) || !this.castFree(rt)) {
        continue;
      }
      rt.readyClock += deltaMs;
      if (rt.readyClock < rt.startDelay) {
        // Hold the cast still while the thread waits its turn to begin.
        for (const member of rt.thread.cast) {
          this.halt(runtime, member.key);
        }
        continue;
      }
      rt.phase = "gathering";
      rt.clock = 0;
      for (const member of rt.thread.cast) {
        const st = this.status.get(member.key);
        if (st) {
          st.threadId = rt.thread.id;
          st.freeMs = 0;
        }
        // Drop any lingering-wander goal so they walk straight to the huddle.
        this.linger.delete(member.key);
      }
    }

    // 2) Drive each thread by its phase.
    for (const rt of this.threads) {
      if (rt.phase === "gathering") {
        this.driveGathering(rt, runtime, state, deltaMs);
      } else if (rt.phase === "talking") {
        this.driveTalking(rt, runtime, state, deltaMs);
      }
    }

    // 3) Free characters between conversations. If a character still has a
    //    future thread, they LINGER — drifting slowly around their location like
    //    the ambient extras — so they are present to be pulled into their next
    //    conversation. Only once they have no remaining threads do they walk off
    //    the map edge and leave the episode for good.
    for (const member of this.script.cast) {
      const st = this.status.get(member.key);
      if (!st || st.threadId !== null || st.departed) {
        continue;
      }
      st.freeMs += deltaMs;
      const c = state.characters[member.key];
      if (!c) {
        continue;
      }
      if (st.freeMs < RELEASE_IDLE_MS) {
        this.halt(runtime, member.key);
        continue;
      }
      if (this.hasFutureThread(member.key)) {
        // Between scenes but not finished — wander near their map so they read
        // as alive and are on hand for their next conversation.
        this.driveLinger(member.key, runtime, c.position);
      } else {
        // Their story is over — leave the episode.
        this.driftOut(this.layoutOf.get(member.key) ?? null, runtime, member.key, c.position, st);
      }
    }

    // 4) Ambient extras drift around their location (or stand and glance), with
    //    no dialogue — they just make the world feel populated.
    for (const [key, ex] of this.extras) {
      const c = state.characters[key];
      if (!c) {
        continue;
      }
      if (ex.behavior === "idle") {
        this.halt(runtime, key);
        continue;
      }
      if (ex.pauseMs > 0) {
        ex.pauseMs -= deltaMs;
        this.halt(runtime, key);
        continue;
      }
      if (!ex.target) {
        ex.target = {
          x: ex.bounds.minX + Math.random() * (ex.bounds.maxX - ex.bounds.minX),
          y: ex.bounds.minY + Math.random() * (ex.bounds.maxY - ex.bounds.minY),
        };
      }
      const arrived = this.driveToward(runtime, key, c.position, ex.target);
      if (arrived) {
        ex.target = null;
        ex.pauseMs = 1500 + Math.random() * 4000;
      }
    }
  }

  // --- speech --------------------------------------------------------------

  /** Character keys that finished walking off the map since the last call; the
   *  scene removes them from the world so they are truly gone, not idling at
   *  the edge. Drains the set each call. */
  consumeDeparted(): string[] {
    if (this.justDeparted.size === 0) {
      return [];
    }
    const keys = [...this.justDeparted];
    this.justDeparted.clear();
    return keys;
  }

  /** The line every talking thread is speaking right now (speaker + turn). */
  currentSpeech(): ThreadSpeech[] {
    const out: ThreadSpeech[] = [];
    for (const rt of this.threads) {
      if (rt.phase !== "talking") {
        continue;
      }
      const beat = Math.floor(rt.clock / BEAT_MS);
      const turn = rt.thread.turns[beat];
      if (!turn || !turn.dialogue.trim() || turn.dialogue.trim() === "...") {
        continue;
      }
      out.push({
        threadId: rt.thread.id,
        locationId: rt.thread.locationId,
        speaker: turn.speaker,
        turn,
      });
    }
    return out;
  }

  // --- internals -----------------------------------------------------------

  private dependenciesDone(rt: ThreadRuntime): boolean {
    return rt.thread.dependsOn.every((dep) => this.byId.get(dep)?.phase === "done");
  }

  private castFree(rt: ThreadRuntime): boolean {
    return rt.thread.cast.every((m) => {
      const st = this.status.get(m.key);
      return st && st.threadId === null && !st.departed;
    });
  }

  /** True if a not-yet-finished thread still includes this character — i.e. they
   *  have another conversation coming and should linger rather than leave. */
  private hasFutureThread(key: string): boolean {
    for (const rt of this.threads) {
      if (rt.phase === "done") {
        continue;
      }
      if (rt.thread.cast.some((m) => m.key === key)) {
        return true;
      }
    }
    return false;
  }

  /** Drift a between-scenes character slowly around their location (a short,
   *  loose wander with pauses) so they stay present for their next thread. */
  private driveLinger(
    key: string,
    runtime: WorldRuntime,
    pos: { x: number; y: number },
  ): void {
    const bounds = this.layoutOf.get(key)?.bounds;
    if (!bounds) {
      this.halt(runtime, key);
      return;
    }
    let state = this.linger.get(key);
    if (!state) {
      state = { target: null, pauseMs: 800 + Math.random() * 2500 };
      this.linger.set(key, state);
    }
    if (state.pauseMs > 0) {
      state.pauseMs -= 16; // approx per-frame; exact dt not needed for a pause
      this.halt(runtime, key);
      return;
    }
    if (!state.target) {
      // A nearby point within the map — small hops, not a march across the room.
      const range = 140;
      state.target = {
        x: clamp(pos.x + (Math.random() - 0.5) * range * 2, bounds.minX, bounds.maxX),
        y: clamp(pos.y + (Math.random() - 0.5) * range * 2, bounds.minY, bounds.maxY),
      };
    }
    const arrived = this.driveToward(runtime, key, pos, state.target);
    if (arrived) {
      state.target = null;
      state.pauseMs = 1500 + Math.random() * 4000;
    }
  }

  private driveGathering(
    rt: ThreadRuntime,
    runtime: WorldRuntime,
    state: WorldState,
    deltaMs: number,
  ): void {
    rt.clock += deltaMs;
    let allArrived = true;
    for (const member of rt.thread.cast) {
      const c = state.characters[member.key];
      const home = rt.layout.homes.get(member.key) ?? rt.layout.centre;
      if (!c) {
        continue;
      }
      const arrived = this.driveToward(runtime, member.key, c.position, home);
      if (!arrived) {
        allArrived = false;
      }
    }
    if (allArrived || rt.clock >= GATHER_TIMEOUT_MS) {
      rt.phase = "talking";
      rt.clock = 0;
      this.faceHuddle(rt, runtime, state);
    }
  }

  private driveTalking(
    rt: ThreadRuntime,
    runtime: WorldRuntime,
    state: WorldState,
    deltaMs: number,
  ): void {
    rt.clock += deltaMs;
    // Hold positions, face the speaker.
    for (const member of rt.thread.cast) {
      this.halt(runtime, member.key);
    }
    this.faceSpeaker(rt, runtime, state);

    const totalMs = rt.thread.turns.length * BEAT_MS + SETTLE_MS;
    if (rt.clock >= totalMs) {
      rt.phase = "done";
      for (const member of rt.thread.cast) {
        const st = this.status.get(member.key);
        if (st && st.threadId === rt.thread.id) {
          st.threadId = null;
          st.freeMs = 0;
        }
      }
    }
  }

  private faceHuddle(rt: ThreadRuntime, runtime: WorldRuntime, state: WorldState): void {
    // Everyone faces the huddle centre.
    for (const member of rt.thread.cast) {
      const other = rt.thread.cast.find((m) => m.key !== member.key);
      if (other && state.characters[member.key] && state.characters[other.key]) {
        this.face(runtime, member.key, other.key);
      }
    }
  }

  private faceSpeaker(rt: ThreadRuntime, runtime: WorldRuntime, state: WorldState): void {
    const beat = Math.floor(rt.clock / BEAT_MS);
    const turn = rt.thread.turns[beat];
    if (!turn) {
      return;
    }
    const speaker = turn.speaker;
    const target = turn.target ?? rt.thread.cast.find((m) => m.key !== speaker)?.key;
    // Listeners face the speaker; the speaker faces their target.
    for (const member of rt.thread.cast) {
      if (member.key === speaker) {
        if (target && state.characters[speaker] && state.characters[target]) {
          this.face(runtime, speaker, target);
        }
      } else if (state.characters[member.key] && state.characters[speaker]) {
        this.face(runtime, member.key, speaker);
      }
    }
  }

  private driveToward(
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

  /** Walk a freed character to the nearest LEFT/RIGHT edge of THEIR OWN map,
   *  then mark them departed so the scene removes them (they exit at the side
   *  and vanish — never walking into the void below a short map). */
  private driftOut(
    layout: ThreadLayout | null,
    runtime: WorldRuntime,
    id: string,
    pos: { x: number; y: number },
    st: CharStatus,
  ): void {
    const bounds = layout?.bounds;
    if (!bounds) {
      this.halt(runtime, id);
      return;
    }
    // Exit toward whichever side edge is closer, staying within the map's
    // walkable band vertically (the scene's per-map clamp enforces this too).
    const toLeft = pos.x - bounds.minX;
    const toRight = bounds.maxX - pos.x;
    const exitX =
      toLeft <= toRight ? bounds.minX + BODY_EDGE_INSET : bounds.maxX - BODY_EDGE_INSET;
    const arrived = Math.abs(pos.x - exitX) <= EXIT_ARRIVE_EPSILON;
    if (arrived) {
      this.halt(runtime, id);
      st.departed = true;
      this.justDeparted.add(id);
      return;
    }
    runtime.dispatch(
      { type: WORLD_ACTION_TYPES.move, entityId: id, intent: { x: exitX - pos.x, y: 0 } },
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
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
