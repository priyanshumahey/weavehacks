// TimeSlider — the observer's scrubber. A fixed bottom bar with a play/pause
// toggle, a range input that seeks the global timeline, and a beat label. It
// replaces the old character-appearance selector. Pure DOM; the scene wires the
// callbacks and pushes progress/label each frame.

export class TimeSlider {
  private readonly root: HTMLDivElement;
  private readonly playButton: HTMLButtonElement;
  private readonly range: HTMLInputElement;
  private readonly speedButton: HTMLButtonElement;
  private readonly label: HTMLSpanElement;
  private seeking = false;
  private onSeek: ((fraction: number) => void) | null = null;
  private onTogglePlay: (() => void) | null = null;
  private onCycleSpeed: (() => void) | null = null;

  constructor(parent: HTMLElement = document.getElementById("app") ?? document.body) {
    this.root = document.createElement("div");
    this.root.className = "replay-timebar";

    this.playButton = document.createElement("button");
    this.playButton.type = "button";
    this.playButton.className = "replay-timebar__play";
    this.playButton.textContent = "❚❚";
    this.playButton.addEventListener("click", () => this.onTogglePlay?.());

    this.range = document.createElement("input");
    this.range.type = "range";
    this.range.className = "replay-timebar__range replay-timebar__range--readonly";
    this.range.min = "0";
    this.range.max = "1000";
    this.range.value = "0";
    this.range.step = "1";
    // Display-only by default: a progress bar, not a scrubber. Seeking is only
    // enabled for scenes that register an onSeek handler (a recorded replay you
    // can scrub); the continuous episode has no rewind/fast-forward, so its bar
    // stays non-interactive (the readonly class blocks pointer events).
    this.range.setAttribute("aria-label", "Playback progress");

    const emitSeek = () => {
      const fraction = Number(this.range.value) / 1000;
      this.onSeek?.(fraction);
    };
    this.range.addEventListener("pointerdown", () => {
      this.seeking = true;
    });
    this.range.addEventListener("input", emitSeek);
    this.range.addEventListener("pointerup", () => {
      this.seeking = false;
    });
    this.range.addEventListener("change", () => {
      this.seeking = false;
    });

    this.label = document.createElement("span");
    this.label.className = "replay-timebar__label";
    this.label.textContent = "";

    this.speedButton = document.createElement("button");
    this.speedButton.type = "button";
    this.speedButton.className = "replay-timebar__speed";
    this.speedButton.textContent = "1×";
    this.speedButton.title = "Playback speed";
    this.speedButton.setAttribute("aria-label", "Cycle playback speed");
    this.speedButton.addEventListener("click", () => this.onCycleSpeed?.());

    this.root.append(this.playButton, this.range, this.label, this.speedButton);
    parent.append(this.root);
  }

  setOnSeek(cb: (fraction: number) => void): void {
    this.onSeek = cb;
    // A seek handler means this scene supports scrubbing: enable the control.
    this.range.classList.remove("replay-timebar__range--readonly");
    this.range.setAttribute("aria-label", "Scrub time");
  }

  setOnTogglePlay(cb: () => void): void {
    this.onTogglePlay = cb;
  }

  setOnCycleSpeed(cb: () => void): void {
    this.onCycleSpeed = cb;
  }

  /** Show the current playback multiplier (e.g. 1, 2, 4). */
  setSpeed(multiplier: number): void {
    this.speedButton.textContent = `${multiplier}×`;
  }

  /** Reflect the live playhead (skipped while the user is dragging). */
  setProgress(fraction: number): void {
    if (this.seeking) {
      return;
    }
    const clamped = clamp(fraction, 0, 1);
    this.range.value = String(Math.round(clamped * 1000));
    // Drive the filled-track gradient so the display-only bar still shows how
    // far into the episode we are (the native thumb is hidden in readonly mode).
    this.range.style.setProperty("--progress", `${clamped * 100}%`);
  }

  setPlaying(playing: boolean): void {
    this.playButton.textContent = playing ? "❚❚" : "▶";
    this.playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  setLabel(text: string): void {
    this.label.textContent = text;
  }

  /**
   * Dock the bar at the bottom (overview) or top (while a conversation panel
   * occupies the bottom of the screen, so the slider does not interfere).
   */
  setDocked(position: "top" | "bottom"): void {
    this.root.classList.toggle("replay-timebar--top", position === "top");
  }

  /** Remove the bar from the DOM (called on scene shutdown). */
  destroy(): void {
    this.root.remove();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
