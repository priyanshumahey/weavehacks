// Minimap — a small top-right overview of the whole episode: every map laid out
// side by side, every conversation huddle as a state-coloured dot, and the live
// camera viewport as a frame. It is the at-a-glance index of "what is going on
// around the world" while the main camera is zoomed into one corner.
//
// Pure presentation + an observer control: EpisodeScene assembles a plain
// MinimapFrame each update and hands it here; clicking a conversation asks the
// scene to fly the camera there. The minimap never touches world state.

import type { WorldBounds } from "../world/worldState";
import type { GroupMood } from "./ensembleTypes";

export type MinimapThreadPhase = "pending" | "gathering" | "talking" | "done";

/** A map rectangle drawn in the overview (one per location the episode uses). */
export interface MinimapLocation {
  id: string;
  label: string;
  bounds: WorldBounds;
}

/** A conversation huddle's fixed position + identity (set once at construction). */
export interface MinimapThread {
  id: string;
  label: string;
  mood: GroupMood;
  x: number;
  y: number;
}

/** The live, per-frame state the scene pushes in each update. */
export interface MinimapFrame {
  /** Thread id -> current phase (omitted threads are treated as pending). */
  phases: Map<string, MinimapThreadPhase>;
  /** Thread ids that have an active speaker on this beat (pulse them). */
  speaking: Set<string>;
  /** The main camera's world-space view rectangle. */
  viewport: { x: number; y: number; width: number; height: number };
}

const PANEL_MAX_W = 280;
const PANEL_MAX_H = 184;
const PANEL_PAD = 10;

const MOOD_COLOR: Record<GroupMood, string> = {
  friendly: "#5fb37a",
  tense: "#e0b95a",
  hostile: "#cc5b52",
};

export class Minimap {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly world: WorldBounds;
  private readonly locations: MinimapLocation[];
  private readonly threads: MinimapThread[];
  /** World->canvas transform (letterboxed to preserve aspect ratio). */
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
  private onFocusThread: ((threadId: string) => void) | null = null;
  private onPan: ((worldX: number, worldY: number) => void) | null = null;

  constructor(
    config: {
      world: WorldBounds;
      locations: MinimapLocation[];
      threads: MinimapThread[];
    },
    parent: HTMLElement = document.getElementById("app") ?? document.body,
  ) {
    this.world = config.world;
    this.locations = config.locations;
    this.threads = config.threads;

    const worldW = Math.max(1, this.world.maxX - this.world.minX);
    const worldH = Math.max(1, this.world.maxY - this.world.minY);
    const drawW = PANEL_MAX_W - PANEL_PAD * 2;
    const drawH = PANEL_MAX_H - PANEL_PAD * 2;
    this.scale = Math.min(drawW / worldW, drawH / worldH);
    const mapW = worldW * this.scale;
    const mapH = worldH * this.scale;
    const canvasW = Math.round(mapW + PANEL_PAD * 2);
    const canvasH = Math.round(mapH + PANEL_PAD * 2);
    // Centre the letterboxed world inside the padded canvas.
    this.offsetX = (canvasW - mapW) / 2;
    this.offsetY = (canvasH - mapH) / 2;

    this.root = document.createElement("div");
    this.root.className = "replay-minimap";
    this.root.setAttribute("aria-label", "World overview");

    const title = document.createElement("span");
    title.className = "replay-minimap__title";
    title.textContent = "Conversations";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "replay-minimap__canvas";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(canvasW * dpr);
    this.canvas.height = Math.round(canvasH * dpr);
    this.canvas.style.width = `${canvasW}px`;
    this.canvas.style.height = `${canvasH}px`;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Minimap: 2D canvas context unavailable");
    }
    ctx.scale(dpr, dpr);
    this.ctx = ctx;

    this.canvas.addEventListener("pointerdown", (event) => this.handleClick(event));

    this.root.append(title, this.canvas);
    parent.append(this.root);
  }

  setOnFocusThread(cb: (threadId: string) => void): void {
    this.onFocusThread = cb;
  }

  setOnPan(cb: (worldX: number, worldY: number) => void): void {
    this.onPan = cb;
  }

  /**
   * Dock the minimap at the bottom-right (overview) or lift it to the top-right
   * (while a conversation panel occupies the bottom of the screen, so the two
   * never overlap).
   */
  setDocked(position: "top" | "bottom"): void {
    this.root.classList.toggle("replay-minimap--top", position === "top");
  }

  /** Draw one frame from the live timeline + camera state. */
  render(frame: MinimapFrame): void {
    const ctx = this.ctx;
    const w = this.canvas.width / (Math.min(window.devicePixelRatio || 1, 2));
    const h = this.canvas.height / (Math.min(window.devicePixelRatio || 1, 2));
    ctx.clearRect(0, 0, w, h);

    // Locations: filled rectangles with a faint border and a corner label.
    ctx.font = "9px 'Palatino Linotype', Palatino, Georgia, serif";
    ctx.textBaseline = "top";
    for (const location of this.locations) {
      const tl = this.worldToCanvas(location.bounds.minX, location.bounds.minY);
      const br = this.worldToCanvas(location.bounds.maxX, location.bounds.maxY);
      const rw = br.x - tl.x;
      const rh = br.y - tl.y;
      ctx.fillStyle = "rgba(28, 42, 53, 0.85)";
      ctx.fillRect(tl.x, tl.y, rw, rh);
      ctx.strokeStyle = "rgba(120, 150, 170, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, rw - 1, rh - 1);
      ctx.fillStyle = "rgba(205, 187, 142, 0.7)";
      ctx.fillText(location.label, tl.x + 3, tl.y + 3, Math.max(0, rw - 6));
    }

    // Conversation huddles: a dot per thread, coloured by mood, sized + lit by
    // phase. Talking threads with an active speaker pulse.
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 320);
    for (const thread of this.threads) {
      const phase = frame.phases.get(thread.id) ?? "pending";
      const point = this.worldToCanvas(thread.x, thread.y);
      const moodColor = MOOD_COLOR[thread.mood] ?? "#cdbb8e";

      if (phase === "talking" && frame.speaking.has(thread.id)) {
        const ringRadius = 6 + pulse * 4;
        ctx.beginPath();
        ctx.arc(point.x, point.y, ringRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(246, 189, 96, ${0.25 + pulse * 0.45})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      const { radius, alpha } = this.dotStyle(phase, pulse);
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(moodColor, alpha);
      ctx.fill();
      if (phase === "talking") {
        ctx.strokeStyle = "rgba(246, 189, 96, 0.9)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // The live camera viewport, so the viewer knows where they are looking.
    const vTl = this.worldToCanvas(frame.viewport.x, frame.viewport.y);
    const vBr = this.worldToCanvas(
      frame.viewport.x + frame.viewport.width,
      frame.viewport.y + frame.viewport.height,
    );
    ctx.strokeStyle = "rgba(246, 189, 96, 0.85)";
    ctx.lineWidth = 1.25;
    ctx.strokeRect(
      vTl.x + 0.5,
      vTl.y + 0.5,
      Math.max(2, vBr.x - vTl.x),
      Math.max(2, vBr.y - vTl.y),
    );
  }

  destroy(): void {
    this.root.remove();
  }

  private dotStyle(
    phase: MinimapThreadPhase,
    pulse: number,
  ): { radius: number; alpha: number } {
    switch (phase) {
      case "talking":
        return { radius: 4.5, alpha: 0.85 + pulse * 0.15 };
      case "gathering":
        return { radius: 3.5, alpha: 0.7 };
      case "done":
        return { radius: 2.5, alpha: 0.3 };
      default:
        return { radius: 3, alpha: 0.45 };
    }
  }

  private worldToCanvas(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: this.offsetX + (worldX - this.world.minX) * this.scale,
      y: this.offsetY + (worldY - this.world.minY) * this.scale,
    };
  }

  private canvasToWorld(canvasX: number, canvasY: number): { x: number; y: number } {
    return {
      x: this.world.minX + (canvasX - this.offsetX) / this.scale,
      y: this.world.minY + (canvasY - this.offsetY) / this.scale,
    };
  }

  private handleClick(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const canvasX = event.clientX - rect.left;
    const canvasY = event.clientY - rect.top;

    // Prefer focusing the nearest conversation if the click landed near a dot.
    let best: { id: string; d2: number } | null = null;
    for (const thread of this.threads) {
      const point = this.worldToCanvas(thread.x, thread.y);
      const dx = point.x - canvasX;
      const dy = point.y - canvasY;
      const d2 = dx * dx + dy * dy;
      if ((!best || d2 < best.d2) && d2 <= 12 * 12) {
        best = { id: thread.id, d2 };
      }
    }
    if (best && this.onFocusThread) {
      this.onFocusThread(best.id);
      return;
    }

    const world = this.canvasToWorld(canvasX, canvasY);
    this.onPan?.(world.x, world.y);
  }
}

/** Apply an alpha to a #rrggbb colour, returning an rgba() string. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
