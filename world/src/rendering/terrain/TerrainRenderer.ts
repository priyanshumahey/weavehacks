import Phaser from "phaser";
import { winterfellWorldLayout } from "../../data/locations/winterfellWorldLayout";
import { RENDER_LAYERS } from "../renderDepth";

export class TerrainRenderer {
  private readonly terrainImages: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  /** When set, only that map is drawn at (0, 0) — a single replay scene. */
  create(activeLocationId?: string): void {
    this.clear();

    const locations = activeLocationId
      ? winterfellWorldLayout.locations.filter((location) => location.id === activeLocationId)
      : winterfellWorldLayout.locations;

    for (const location of locations) {
      const config = location.map;

      if (!this.scene.textures.exists(config.textureKey)) {
        continue;
      }

      const image = this.scene.add
        .image(activeLocationId ? 0 : location.offset.x, activeLocationId ? 0 : location.offset.y, config.textureKey)
        .setOrigin(0, 0)
        .setDisplaySize(config.width, config.height)
        .setDepth(RENDER_LAYERS.terrain);

      this.terrainImages.push(image);
    }
  }

  clear(): void {
    for (const image of this.terrainImages) {
      image.destroy();
    }
    this.terrainImages.length = 0;
  }
}
