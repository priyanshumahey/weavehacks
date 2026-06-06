import type Phaser from "phaser";
import { CharacterRenderer } from "../characters/CharacterRenderer";
import { WorldUiRenderer } from "../ui/WorldUiRenderer";
import { createWorldFrame } from "./createWorldFrame";
import type { WorldState } from "../../world/worldState";

export class WorldRenderer {
  private readonly characterRenderer: CharacterRenderer;
  private readonly uiRenderer: WorldUiRenderer;
  private hasCreatedFrame = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.characterRenderer = new CharacterRenderer(scene);
    this.uiRenderer = new WorldUiRenderer(scene);
  }

  create(state: WorldState): void {
    if (!this.hasCreatedFrame) {
      createWorldFrame(this.scene, state.bounds);
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
