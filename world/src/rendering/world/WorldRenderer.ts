import type Phaser from "phaser";
import { CharacterRenderer } from "../characters/CharacterRenderer";
import { TerrainRenderer } from "../terrain/TerrainRenderer";
import { WorldUiRenderer } from "../ui/WorldUiRenderer";
import { createWorldFrame } from "./createWorldFrame";
import type { WorldState } from "../../world/worldState";

export class WorldRenderer {
  private readonly terrainRenderer: TerrainRenderer;
  private readonly characterRenderer: CharacterRenderer;
  private readonly uiRenderer: WorldUiRenderer;
  private hasCreatedFrame = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.terrainRenderer = new TerrainRenderer(scene);
    this.characterRenderer = new CharacterRenderer(scene);
    this.uiRenderer = new WorldUiRenderer(scene);
  }

  create(state: WorldState): void {
    if (!this.hasCreatedFrame) {
      this.terrainRenderer.create(state.bounds);
      createWorldFrame(this.scene);
      this.hasCreatedFrame = true;
    }

    this.characterRenderer.render(state);
    this.uiRenderer.render(state);
  }

  render(state: WorldState): void {
    this.characterRenderer.render(state);
    this.uiRenderer.render(state);
  }
}
