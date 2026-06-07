// ReplayDirector — the dialogue timeline for a replay. Owns the playhead over
// scenes -> turns, advanced manually by the viewer ("dialogue continues as I
// choose"). It is presentation-agnostic: it tracks which turn is current and the
// most recent line each character has spoken in the current scene (so ambient
// bubbles persist between advances). It never touches Phaser or world state.

import type {
  ReplayDocument,
  ReplaySceneData,
  ReplayTurn,
} from "./replayTypes";

export interface ActiveLine {
  speaker: string;
  speakerName: string;
  dialogue: string;
  publicStance: string;
  privateIntent: string;
  thinking: string;
  action: string;
  target: string | null;
}

export class ReplayDirector {
  private readonly doc: ReplayDocument;
  private sceneIndex = 0;
  private turnIndex = 0;
  /** Most recent line per character key within the current scene. */
  private readonly activeLines = new Map<string, ActiveLine>();

  constructor(doc: ReplayDocument) {
    this.doc = doc;
    this.recordCurrent();
  }

  get episodeTitle(): string {
    return this.doc.title;
  }

  currentScene(): ReplaySceneData | null {
    return this.doc.scenes[this.sceneIndex] ?? null;
  }

  currentSceneIndex(): number {
    return this.sceneIndex;
  }

  currentTurn(): ReplayTurn | null {
    return this.currentScene()?.turns[this.turnIndex] ?? null;
  }

  /** Character keys present in the current scene. */
  sceneCast(): string[] {
    return this.currentScene()?.cast ?? [];
  }

  /** The character speaking right now (or null on a silent/empty turn). */
  currentSpeaker(): string | null {
    const turn = this.currentTurn();
    return turn && turn.dialogue.trim() ? turn.speaker : null;
  }

  activeLineFor(key: string): ActiveLine | null {
    return this.activeLines.get(key) ?? null;
  }

  isAtEnd(): boolean {
    const scene = this.currentScene();
    if (!scene) {
      return true;
    }
    const lastScene = this.sceneIndex >= this.doc.scenes.length - 1;
    const lastTurn = this.turnIndex >= scene.turns.length - 1;
    return lastScene && lastTurn;
  }

  progressLabel(): string {
    const scene = this.currentScene();
    const turns = scene?.turns.length ?? 0;
    return (
      `Scene ${this.sceneIndex + 1}/${this.doc.scenes.length} · ` +
      `Turn ${this.turnIndex + 1}/${turns}`
    );
  }

  /**
   * Advance the playhead one turn. Crosses into the next scene when the current
   * scene's turns are exhausted (clearing ambient lines for the new setting).
   * Returns false when already at the end.
   */
  advance(): boolean {
    if (this.isAtEnd()) {
      return false;
    }

    const scene = this.currentScene();
    if (scene && this.turnIndex < scene.turns.length - 1) {
      this.turnIndex += 1;
    } else {
      this.sceneIndex += 1;
      this.turnIndex = 0;
      this.activeLines.clear();
    }

    this.recordCurrent();
    return true;
  }

  private recordCurrent(): void {
    const turn = this.currentTurn();
    if (turn && turn.dialogue.trim()) {
      this.activeLines.set(turn.speaker, {
        speaker: turn.speaker,
        speakerName: turn.speakerName,
        dialogue: turn.dialogue,
        publicStance: turn.publicStance,
        privateIntent: turn.privateIntent,
        thinking: turn.thinking,
        action: turn.action,
        target: turn.target,
      });
    }
  }
}
