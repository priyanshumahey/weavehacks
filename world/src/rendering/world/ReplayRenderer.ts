// ReplayRenderer — a lean renderer for the observer replay. Draws terrain and
// character sprites plus a fixed name label *under* each character. It pointedly
// omits the interactive WorldUiRenderer (the player appearance selector) so the
// replay reads as an observer view, not a controllable sandbox.

import type Phaser from "phaser";
import { CharacterRenderer } from "../characters/CharacterRenderer";
import { TerrainRenderer } from "../terrain/TerrainRenderer";
import { createWorldFrame } from "../world/createWorldFrame";
import type { WorldState } from "../../world/worldState";

const NAME_DEPTH = 100_000;
const NAME_GAP_BELOW_FEET = 6;

export class ReplayRenderer {
  private readonly terrainRenderer: TerrainRenderer;
  private readonly characterRenderer: CharacterRenderer;
  private readonly nameLabels = new Map<string, Phaser.GameObjects.Text>();
  private hasCreatedFrame = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.terrainRenderer = new TerrainRenderer(scene);
    this.characterRenderer = new CharacterRenderer(scene);
  }

  create(state: WorldState, locationId: string): void {
    this.terrainRenderer.create(locationId);
    if (!this.hasCreatedFrame) {
      createWorldFrame(this.scene);
      this.hasCreatedFrame = true;
    }
    this.characterRenderer.render(state);
    this.renderNames(state);
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
    this.renderNames(state);
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
    this.renderNames(state);
  }

  destroy(): void {
    this.terrainRenderer.clear();
    for (const label of this.nameLabels.values()) {
      label.destroy();
    }
    this.nameLabels.clear();
    this.hasCreatedFrame = false;
  }

  render(state: WorldState): void {
    this.characterRenderer.render(state);
    this.renderNames(state);
  }

  private renderNames(state: WorldState): void {
    const active = new Set(Object.keys(state.characters));
    for (const [id, label] of this.nameLabels) {
      if (!active.has(id)) {
        label.destroy();
        this.nameLabels.delete(id);
      }
    }

    for (const character of Object.values(state.characters)) {
      let label = this.nameLabels.get(character.id);
      if (!label) {
        label = this.scene.add
          .text(0, 0, character.name, {
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "12px",
            color: "#f4e4bc",
            backgroundColor: "#10212bcc",
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5, 0)
          .setDepth(NAME_DEPTH);
        this.nameLabels.set(character.id, label);
      }
      label.setPosition(character.position.x, character.position.y + NAME_GAP_BELOW_FEET);
    }
  }
}
