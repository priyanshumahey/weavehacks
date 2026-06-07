import Phaser from "phaser";
import { winterfellWorldLayout } from "../../data/locations/winterfellWorldLayout";
import { RENDER_LAYERS } from "../renderDepth";

export class TerrainRenderer {
  private hasCreated = false;

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    if (this.hasCreated) {
      return;
    }

    for (const location of winterfellWorldLayout.locations) {
      const config = location.map;

      if (!this.scene.textures.exists(config.textureKey)) {
        continue;
      }

      this.scene.add
        .image(location.offset.x, location.offset.y, config.textureKey)
        .setOrigin(0, 0)
        .setDisplaySize(config.width, config.height)
        .setDepth(RENDER_LAYERS.terrain);
    }

    this.hasCreated = true;
  }
}
