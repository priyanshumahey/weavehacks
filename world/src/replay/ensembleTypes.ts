// Ensemble replay contract — a *living world* of concurrent conversation groups
// on one shared timeline. Where `replayTypes.ts` is a single linear scene
// sequence, this is the multi-track form: several groups talk at once, each in
// its own corner of the map, and the observer peeks into one by clicking it.

import type { ReplayCastMember } from "./replayTypes";

/** How a group behaves on stage — drives staging radius and movement. */
export type GroupMood = "friendly" | "tense" | "hostile";

export const GROUP_MOODS = {
  friendly: "friendly",
  tense: "tense",
  hostile: "hostile",
} as const;

/** One spoken beat within a group's conversation. */
export interface EnsembleTurn {
  speaker: string; // character key
  speakerName: string;
  dialogue: string;
  publicStance: string;
  privateIntent: string;
  /** Typed-core action (drives the reaction emoji). */
  action: string;
  target: string | null;
}

export interface EnsembleGroup {
  id: string;
  label: string;
  mood: GroupMood;
  cast: ReplayCastMember[];
  /** Optional location id — anchor is normalized within that location's bounds. */
  locationId?: string;
  /** Huddle anchor in normalized playfield coords (0..1, 0..1). */
  anchor: { x: number; y: number };
  turns: EnsembleTurn[];
}

/** A precomputed incidental meeting during the post-scene mingle: two
 *  characters cross paths, trade a few words, and part. The world choreographs
 *  the walk-together so it reads as emergent, then plays these turns in place. */
export interface EnsembleEncounter {
  id: string;
  setting: string;
  mood: GroupMood;
  /** Exactly two members. */
  cast: ReplayCastMember[];
  turns: EnsembleTurn[];
}

export interface EnsembleReplay {
  version: number;
  title: string;
  groups: EnsembleGroup[];
  /** Optional precomputed mingle meetings, played after the scenes settle. */
  encounters?: EnsembleEncounter[];
}

export const SUPPORTED_ENSEMBLE_VERSION = 1;
