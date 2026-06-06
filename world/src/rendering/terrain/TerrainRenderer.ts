import Phaser from "phaser";
import { defaultTerrainLayer, resolveTerrainTileIndex } from "../../data/terrain/defaultTerrain";
import { RENDER_LAYERS } from "../renderDepth";
import type { WorldBounds } from "../../world/worldState";

export class TerrainRenderer {
  private hasCreated = false;

  constructor(private readonly scene: Phaser.Scene) {}

  create(bounds: WorldBounds): void {
    if (this.hasCreated) {
      return;
    }

    const config = defaultTerrainLayer;

    if (!this.scene.textures.exists(config.textureKey)) {
      return;
    }

    const frameWidth = bounds.maxX - bounds.minX;
    const frameHeight = bounds.maxY - bounds.minY;
    const tileCols = Math.ceil(frameWidth / config.tileSize);
    const tileRows = Math.ceil(frameHeight / config.tileSize);

    const map = this.scene.make.tilemap({
      tileWidth: config.tileSize,
      tileHeight: config.tileSize,
      width: tileCols,
      height: tileRows,
    });

    const tileset = map.addTilesetImage(
      config.tilesetName,
      config.textureKey,
      config.tileSize,
      config.tileSize,
      0,
      0,
      config.firstGid,
    );

    if (!tileset) {
      return;
    }

    const layer = map.createBlankLayer(
      config.layerId,
      tileset,
      bounds.minX,
      bounds.minY,
      tileCols,
      tileRows,
    );

    if (!layer) {
      return;
    }

    const fillTileIndex = resolveTerrainTileIndex(config, config.fillTile);
    layer.fill(fillTileIndex, 0, 0, tileCols, tileRows);
    layer.setDepth(RENDER_LAYERS.terrain);
    this.applyBoundsMask(layer, bounds);

    this.hasCreated = true;
  }

  private applyBoundsMask(layer: Phaser.Tilemaps.TilemapLayer, bounds: WorldBounds): void {
    const frameWidth = bounds.maxX - bounds.minX;
    const frameHeight = bounds.maxY - bounds.minY;
    const maskGraphics = this.scene.make.graphics({ x: 0, y: 0 });

    maskGraphics.fillStyle(0xffffff);
    maskGraphics.fillRect(bounds.minX, bounds.minY, frameWidth, frameHeight);
    layer.setMask(maskGraphics.createGeometryMask());
  }
}
