import type Phaser from "phaser";
import { CharacterRenderer } from "../characters/CharacterRenderer";
import { PropRenderer } from "../props/PropRenderer";
import { TerrainRenderer } from "../terrain/TerrainRenderer";
import { WorldUiRenderer } from "../ui/WorldUiRenderer";
import { createWorldFrame } from "./createWorldFrame";
import type { WorldState } from "../../world/worldState";

export class WorldRenderer {
  private readonly terrainRenderer: TerrainRenderer;
  private readonly propRenderer: PropRenderer;
  private readonly characterRenderer: CharacterRenderer;
  private readonly uiRenderer: WorldUiRenderer;
  private hasCreatedFrame = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.terrainRenderer = new TerrainRenderer(scene);
    this.propRenderer = new PropRenderer(scene);
    this.characterRenderer = new CharacterRenderer(scene);
    this.uiRenderer = new WorldUiRenderer(scene);
  }

  create(state: WorldState): void {
    if (!this.hasCreatedFrame) {
      this.terrainRenderer.create(state.bounds);
      createWorldFrame(this.scene);
      this.hasCreatedFrame = true;
    }

    this.propRenderer.render(state);
    this.characterRenderer.render(state);
    this.uiRenderer.render(state);
  }

  render(state: WorldState): void {
    this.propRenderer.render(state);
    this.characterRenderer.render(state);
    this.uiRenderer.render(state);
  }
}
