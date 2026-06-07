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

  /** Draw a SUBSET of maps at their real world offsets — for an episode that
   *  spans only some locations (the others would render as empty maps). */
  createForLocations(locationIds: string[]): void {
    this.clear();
    const wanted = new Set(locationIds);
    for (const location of winterfellWorldLayout.locations) {
      if (!wanted.has(location.id)) {
        continue;
      }
      const config = location.map;
      if (!this.scene.textures.exists(config.textureKey)) {
        continue;
      }
      const image = this.scene.add
        .image(location.offset.x, location.offset.y, config.textureKey)
        .setOrigin(0, 0)
        .setDisplaySize(config.width, config.height)
        .setDepth(RENDER_LAYERS.terrain);
      this.terrainImages.push(image);
    }
  }

  /** Draw maps at explicit (packed) offsets — a split-screen of just the maps an
   *  episode visits, side by side with no empty maps between them. */
  createAtPlacements(
    placements: { locationId: string; offsetX: number; offsetY: number }[],
  ): void {
    this.clear();
    const byId = new Map<string, (typeof winterfellWorldLayout.locations)[number]>(
      winterfellWorldLayout.locations.map((l) => [l.id, l]),
    );
    for (const placement of placements) {
      const location = byId.get(placement.locationId);
      if (!location) {
        continue;
      }
      const config = location.map;
      if (!this.scene.textures.exists(config.textureKey)) {
        continue;
      }
      const image = this.scene.add
        .image(placement.offsetX, placement.offsetY, config.textureKey)
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
