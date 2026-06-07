// EnsembleTimeline — one global clock that drives every conversation group at
// once. A scene plays in three phases on a single ms clock:
//   1. ENTERING — characters walk in from the edges; no dialogue yet.
//   2. TALKING  — beats advance, one spoken turn per beat across all groups.
//   3. SETTLING — a short breath after the last line before the world rests.
// The observer scrubs one slider across all three; shorter conversations hold
// their final line while longer ones keep talking, then everyone settles.

import type { EnsembleGroup, EnsembleReplay, EnsembleTurn } from "./ensembleTypes";

const BEAT_MS = 8500; // wall-clock duration of one spoken turn during auto-play
const ENTRANCE_MS = 5200; // walking-in period before anyone speaks
const SETTLE_MS = 3000; // quiet beat after the final line

export type TimelinePhase = "entering" | "talking" | "settling";

export class EnsembleTimeline {
  private readonly groups: EnsembleGroup[];
  private readonly totalBeats: number;
  private readonly talkMs: number;
  private readonly totalMs: number;
  private elapsed = 0; // ms playhead in [0, totalMs]
  private playing = true;

  constructor(replay: EnsembleReplay) {
    this.groups = replay.groups;
    this.totalBeats = Math.max(1, ...replay.groups.map((g) => g.turns.length));
    this.talkMs = this.totalBeats * BEAT_MS;
    this.totalMs = ENTRANCE_MS + this.talkMs + SETTLE_MS;
  }

  get phase(): TimelinePhase {
    if (this.elapsed < ENTRANCE_MS) {
      return "entering";
    }
    if (this.elapsed < ENTRANCE_MS + this.talkMs) {
      return "talking";
    }
    return "settling";
  }

  /** True while characters are still walking into the scene. */
  get isEntering(): boolean {
    return this.elapsed < ENTRANCE_MS;
  }

  /** Playhead as a fraction in [0, 1] — what the slider shows. */
  get progress(): number {
    return this.totalMs > 0 ? this.elapsed / this.totalMs : 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get atEnd(): boolean {
    return this.elapsed >= this.totalMs;
  }

  /** Continuous beat playhead within the talking phase (>= 0). */
  private get beat(): number {
    return Math.max(0, (this.elapsed - ENTRANCE_MS) / BEAT_MS);
  }

  setProgress(fraction: number): void {
    this.elapsed = clamp(fraction, 0, 1) * this.totalMs;
  }

  setPlaying(playing: boolean): void {
    // Resuming from the end restarts the world.
    if (playing && this.atEnd) {
      this.elapsed = 0;
    }
    this.playing = playing;
  }

  togglePlaying(): void {
    this.setPlaying(!this.playing);
  }

  /** Step forward (viewer "click to continue"): skip the walk-in, else +1 beat. */
  stepForward(): void {
    if (this.isEntering) {
      this.elapsed = ENTRANCE_MS;
      return;
    }
    const nextBeat = Math.floor(this.beat) + 1;
    this.elapsed = Math.min(ENTRANCE_MS + nextBeat * BEAT_MS, this.totalMs);
  }

  update(deltaMs: number): void {
    if (!this.playing) {
      return;
    }
    this.elapsed = Math.min(this.elapsed + deltaMs, this.totalMs);
  }

  /** Active turn index within a group at the current beat. */
  turnIndexFor(group: EnsembleGroup): number {
    if (group.turns.length === 0) {
      return -1;
    }
    return clampInt(Math.floor(this.beat), 0, group.turns.length - 1);
  }

  activeTurn(group: EnsembleGroup): EnsembleTurn | null {
    // No dialogue while walking in.
    if (this.isEntering) {
      return null;
    }
    const index = this.turnIndexFor(group);
    return index >= 0 ? group.turns[index] : null;
  }

  /** The speaker key for a group right now, or null on a silent/empty turn. */
  speakerOf(group: EnsembleGroup): string | null {
    const turn = this.activeTurn(group);
    return turn && turn.dialogue.trim() && turn.dialogue.trim() !== "..."
      ? turn.speaker
      : null;
  }

  progressLabel(): string {
    if (this.phase === "entering") {
      return "entering…";
    }
    if (this.phase === "settling") {
      return "settling…";
    }
    const current = Math.min(Math.floor(this.beat) + 1, this.totalBeats);
    return `beat ${current} / ${this.totalBeats}`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
