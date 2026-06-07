// ReplayCamera — observer controls for the replay: drag to pan, wheel to zoom.
// The viewer "flies around" freely; this never touches world state. Uses Phaser
// camera APIs (scroll + zoom) per the engine's Phaser-first rule.

import Phaser from "phaser";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.0015; // per wheel delta unit

export class ReplayCamera {
  private readonly scene: Phaser.Scene;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private dragMoved = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bind();
  }

  /** True if the last pointer interaction was a drag (so callers can ignore the click). */
  consumeDragMoved(): boolean {
    const moved = this.dragMoved;
    this.dragMoved = false;
    return moved;
  }

  /** Smoothly pan + zoom the observer camera to frame a conversation huddle. */
  frameOn(x: number, y: number, zoom = 0.8, durationMs = 650): void {
    const cam = this.scene.cameras.main;
    cam.pan(x, y, durationMs, Phaser.Math.Easing.Sine.InOut, true);
    cam.zoomTo(Phaser.Math.Clamp(zoom, MIN_ZOOM, MAX_ZOOM), durationMs);
  }

  private bind(): void {
    const input = this.scene.input;

    input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragMoved = false;
      this.lastX = pointer.x;
      this.lastY = pointer.y;
    });

    input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging || !pointer.isDown) {
        return;
      }
      const dx = pointer.x - this.lastX;
      const dy = pointer.y - this.lastY;
      if (Math.abs(dx) + Math.abs(dy) > 2) {
        this.dragMoved = true;
      }
      const cam = this.scene.cameras.main;
      cam.scrollX -= dx / cam.zoom;
      cam.scrollY -= dy / cam.zoom;
      this.lastX = pointer.x;
      this.lastY = pointer.y;
    });

    input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.dragging = false;
    });

    input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (_pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        const cam = this.scene.cameras.main;
        const next = Phaser.Math.Clamp(cam.zoom - dy * ZOOM_STEP, MIN_ZOOM, MAX_ZOOM);
        cam.setZoom(next);
      },
    );
  }
}
