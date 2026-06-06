import { deriveWorldTextureKey } from "../../assets/worldAssetRegistry";
import {
  TERRAIN_LAYER_IDS,
  TERRAIN_TEXTURE_SOURCE_PATHS,
  TERRAIN_TILESET_NAMES,
  TERRAIN_TILE_SIZE,
  type TerrainLayerDefinition,
  type TerrainTileRef,
} from "../../types/terrain";

const TILEMAP_COLUMNS_PER_ROW = 18;

export const defaultTerrainLayer: TerrainLayerDefinition = {
  textureSourcePath: TERRAIN_TEXTURE_SOURCE_PATHS.tilemapColor1,
  textureKey: deriveWorldTextureKey(TERRAIN_TEXTURE_SOURCE_PATHS.tilemapColor1),
  tilesetName: TERRAIN_TILESET_NAMES.base,
  layerId: TERRAIN_LAYER_IDS.ground,
  tileSize: TERRAIN_TILE_SIZE,
  columnsPerRow: TILEMAP_COLUMNS_PER_ROW,
  firstGid: 1,
  fillTile: {
    column: 3,
    row: 2,
  },
};

export function resolveTerrainTileIndex(
  layer: TerrainLayerDefinition,
  tile: TerrainTileRef,
): number {
  return layer.firstGid + tile.row * layer.columnsPerRow + tile.column;
}
