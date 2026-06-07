// Replay document contract — mirrors the Python emitter
// (`got_agents/outputs/replay_contract.py`). This is the locked interface
// between the simulation "mind" (Python) and the game "body" (this engine):
// a recorded chronicle the world plays back. Keep these fields in sync with
// `to_replay()` on the Python side.

export interface ReplayCastMember {
  /** Stable character key, e.g. "cersei". */
  key: string;
  /** Display name, e.g. "Cersei Lannister". */
  name: string;
  /** Charset frame directory under `world/charsets/sprites/<charset>`. */
  charset: string;
  /** Optional title, e.g. "Queen Regent" — shown in the debug overlay. */
  title?: string;
  /** Optional 8-drive baseline (0..100), surfaced in the debug overlay. */
  drives?: Record<string, number>;
}

export interface ReplayTurn {
  /** Speaker character key. */
  speaker: string;
  speakerName: string;
  round: number;
  /** Typed-core action, e.g. "speak" | "ally" | "share_secret". */
  action: string;
  /** Target character key, or null. */
  target: string | null;
  targetName: string | null;
  /** The spoken line (empty when the character stayed silent). */
  dialogue: string;
  /** What the room sees/hears the speaker intend. */
  publicStance: string;
  /** The true aim (may contradict the public stance) — the deception layer. */
  privateIntent: string;
  /** Short inner voice, logged for interpretability. */
  thinking: string;
}

export interface ReplaySceneData {
  index: number;
  setting: string;
  stakes: string;
  /** Character keys present in this scene. */
  cast: string[];
  turns: ReplayTurn[];
  /** Resolved world effects this scene produced. */
  effects: Array<Record<string, unknown>>;
}

export interface ReplayWorldSnapshot {
  point?: string;
  dead?: string[];
  titles?: Record<string, string>;
  oaths?: Array<{ by: string; to: string; terms: string }>;
  alliances?: string[][];
  marriages?: string[][];
  secrets?: Record<string, { fact: string; known_to: string[] }>;
}

export interface ReplayDocument {
  version: number;
  episode: string;
  title: string;
  cast: ReplayCastMember[];
  scenes: ReplaySceneData[];
  worldStart?: ReplayWorldSnapshot;
  worldEnd?: ReplayWorldSnapshot;
  reflections?: Record<
    string,
    { summary: string; rules: string[]; relationships: Record<string, string> }
  >;
}

/** The replay contract version this engine understands. */
export const SUPPORTED_REPLAY_VERSION = 1;
