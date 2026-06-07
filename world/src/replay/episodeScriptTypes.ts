// Episode-script contract — the *continuous timeline* the world plays, mirroring
// got_agents/outputs/episode_script.py. Where the ensemble contract is concurrent
// groups on one lockstep clock localized to a single map, this is a flat list of
// THREADS (conversations) on one continuous clock that may span MULTIPLE maps:
//
//   * Each thread has its own map `locationId` + `anchor`, `cast`, `turns`, mood.
//   * `dependsOn` lists the thread ids that must finish before it can begin
//     (derived from per-character ordering on the backend), so a character is
//     never in two threads at once and "break off and start a new conversation"
//     emerges naturally.
//   * Threads finish at different times (different turn counts).
//
// A `learning` block carries evidence the agents grew across the episode.

import type { ReplayCastMember } from "./replayTypes";
import type { EnsembleTurn, GroupMood } from "./ensembleTypes";

export const EPISODE_SCRIPT_VERSION = 2;

/** One conversation thread on the continuous timeline. */
export interface ScriptThread {
  id: string;
  /** The phase (planning round) this thread was staged in. */
  phase: number;
  /** Which map this thread happens on. */
  locationId: string;
  /** Huddle anchor in normalized playfield coords (0..1) within that location. */
  anchor: { x: number; y: number };
  mood: GroupMood;
  label: string;
  /** The thread's topic/setting sentence. */
  topic: string;
  stakes: string;
  cast: ReplayCastMember[];
  /** Thread ids that must finish before this one can begin. */
  dependsOn: string[];
  turns: EnsembleTurn[];
  /** Per-character drive deltas from this scene's appraisal (learning). */
  driveDeltas?: Record<string, Record<string, number>>;
  /** Per-character one-word emotion after this scene. */
  emotion?: Record<string, string>;
}

/** Evidence the agents grew across the episode. */
export interface EpisodeLearning {
  /** Per-character drive snapshots over time: key -> [{thread, drives}]. */
  driveTrajectory?: Record<string, { thread: string; drives: Record<string, number> }[]>;
  /** Per-character end-of-episode reflection. */
  reflections?: Record<
    string,
    { summary: string; rules?: string[]; relationships?: Record<string, string> }
  >;
}

export interface EpisodeScript {
  version: number;
  kind: "episode-script";
  title: string;
  premise: string;
  episode: string;
  cast: ReplayCastMember[];
  threads: ScriptThread[];
  /** Ambient side characters who are simply present — they mill about a location
   *  with no dialogue and no thread, so a scene feels populated. */
  extras?: ScriptExtra[];
  learning?: EpisodeLearning;
  meta?: Record<string, unknown>;
}

/** A non-speaking ambient character placed at a location to fill out the world. */
export interface ScriptExtra {
  key: string;
  name: string;
  charset: string;
  locationId: string;
  /** Optional anchor (0..1) within the location; random-ish if omitted. */
  anchor?: { x: number; y: number };
  /** "wander" drifts between nearby points; "idle" stands and glances around. */
  behavior?: "wander" | "idle";
}

/** Type guard: is this loaded doc an episode-script (vs an ensemble replay)? */
export function isEpisodeScript(doc: unknown): doc is EpisodeScript {
  return (
    !!doc &&
    typeof doc === "object" &&
    (doc as { kind?: string }).kind === "episode-script" &&
    Array.isArray((doc as { threads?: unknown }).threads)
  );
}

/** The distinct location ids a script uses, in first-appearance order. */
export function scriptLocations(script: EpisodeScript): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const thread of script.threads) {
    if (!seen.has(thread.locationId)) {
      seen.add(thread.locationId);
      out.push(thread.locationId);
    }
  }
  return out;
}
