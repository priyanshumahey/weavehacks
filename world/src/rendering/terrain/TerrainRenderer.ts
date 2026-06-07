import Phaser from "phaser";
import { defaultMapBackground } from "../../data/terrain/defaultMapBackground";
import { RENDER_LAYERS } from "../renderDepth";

export class TerrainRenderer {
  private hasCreated = false;

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    if (this.hasCreated) {
      return;
    }

    const config = defaultMapBackground;

    if (!this.scene.textures.exists(config.textureKey)) {
      return;
    }

    this.scene.add
      .image(0, 0, config.textureKey)
      .setOrigin(0, 0)
      .setDisplaySize(config.width, config.height)
      .setDepth(RENDER_LAYERS.terrain);

    this.hasCreated = true;
  }
}
