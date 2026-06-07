// ReplayRenderer — a lean renderer for the observer replay. Draws terrain and
// character sprites plus crisp HTML name labels under each character. It
// pointedly omits the interactive WorldUiRenderer (the player appearance
// selector) so the replay reads as an observer view, not a controllable sandbox.

import type Phaser from "phaser";
import { CharacterRenderer } from "../characters/CharacterRenderer";
import { CharacterLabelRenderer } from "../ui/CharacterLabelRenderer";
import { TerrainRenderer } from "../terrain/TerrainRenderer";
import { createWorldFrame } from "./createWorldFrame";
import type { WorldState } from "../../world/worldState";

export class ReplayRenderer {
  private readonly terrainRenderer: TerrainRenderer;
  private readonly characterRenderer: CharacterRenderer;
  private readonly characterLabelRenderer: CharacterLabelRenderer;
  private hasCreatedFrame = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.terrainRenderer = new TerrainRenderer(scene);
    this.characterRenderer = new CharacterRenderer(scene);
    this.characterLabelRenderer = new CharacterLabelRenderer(scene, {
      placement: "below",
    });
  }

  create(state: WorldState, locationId: string): void {
    this.terrainRenderer.create(locationId);
    if (!this.hasCreatedFrame) {
      createWorldFrame(this.scene);
      this.hasCreatedFrame = true;
    }
    this.characterRenderer.render(state);
    this.characterLabelRenderer.render(state);
  }

  /** Create the frame drawing only the given maps at their world offsets — for
   *  a multi-map episode that spans a subset of locations. */
  createForLocations(state: WorldState, locationIds: string[]): void {
    this.terrainRenderer.createForLocations(locationIds);
    if (!this.hasCreatedFrame) {
      createWorldFrame(this.scene);
      this.hasCreatedFrame = true;
    }
    this.characterRenderer.render(state);
    this.characterLabelRenderer.render(state);
  }

  /** Create the frame drawing maps at explicit packed offsets (split-screen). */
  createAtPlacements(
    state: WorldState,
    placements: { locationId: string; offsetX: number; offsetY: number }[],
  ): void {
    this.terrainRenderer.createAtPlacements(placements);
    if (!this.hasCreatedFrame) {
      createWorldFrame(this.scene);
      this.hasCreatedFrame = true;
    }
    this.characterRenderer.render(state);
    this.characterLabelRenderer.render(state);
  }

  destroy(): void {
    this.terrainRenderer.clear();
    this.characterLabelRenderer.destroy();
    this.hasCreatedFrame = false;
  }

  render(state: WorldState): void {
    this.characterRenderer.render(state);
    this.characterLabelRenderer.render(state);
  }
}
