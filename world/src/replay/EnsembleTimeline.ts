// EnsembleTimeline — one global clock that drives every conversation group at
// once. Time is measured in "beats" (one spoken turn per beat). All groups
// advance on the same beat, so the observer can scrub a single slider and watch
// the whole world move together. Shorter conversations hold their final line
// while longer ones keep talking, then the world settles.

import type { EnsembleGroup, EnsembleReplay, EnsembleTurn } from "./ensembleTypes";

const BEAT_MS = 7000; // wall-clock duration of one turn during auto-play

export class EnsembleTimeline {
  private readonly groups: EnsembleGroup[];
  private readonly totalBeats: number;
  private beat = 0; // float playhead in [0, totalBeats]
  private playing = true;

  constructor(replay: EnsembleReplay) {
    this.groups = replay.groups;
    this.totalBeats = Math.max(1, ...replay.groups.map((g) => g.turns.length));
  }

  /** Playhead as a fraction in [0, 1] — what the slider shows. */
  get progress(): number {
    return this.totalBeats > 0 ? this.beat / this.totalBeats : 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get atEnd(): boolean {
    return this.beat >= this.totalBeats;
  }

  setProgress(fraction: number): void {
    this.beat = clamp(fraction, 0, 1) * this.totalBeats;
  }

  setPlaying(playing: boolean): void {
    // Resuming from the end restarts the world.
    if (playing && this.atEnd) {
      this.beat = 0;
    }
    this.playing = playing;
  }

  togglePlaying(): void {
    this.setPlaying(!this.playing);
  }

  /** Step the global beat forward by one (viewer "click to continue"). */
  stepForward(): void {
    this.beat = Math.min(Math.floor(this.beat) + 1, this.totalBeats);
  }

  update(deltaMs: number): void {
    if (!this.playing) {
      return;
    }
    this.beat = Math.min(this.beat + deltaMs / BEAT_MS, this.totalBeats);
  }

  /** Active turn index within a group at the current beat. */
  turnIndexFor(group: EnsembleGroup): number {
    if (group.turns.length === 0) {
      return -1;
    }
    return clampInt(Math.floor(this.beat), 0, group.turns.length - 1);
  }

  activeTurn(group: EnsembleGroup): EnsembleTurn | null {
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
