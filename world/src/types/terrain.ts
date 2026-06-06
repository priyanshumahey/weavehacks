export const TERRAIN_TILE_SIZE = 32 as const;

export const TERRAIN_TEXTURE_SOURCE_PATHS = {
  tilemapColor1: "Terrain/Tileset/Tilemap_color1.png",
} as const;

export const TERRAIN_TILESET_NAMES = {
  base: "terrain-base-tileset",
} as const;

export const TERRAIN_LAYER_IDS = {
  ground: "terrain-ground",
} as const;

export interface TerrainTileRef {
  column: number;
  row: number;
}

export interface TerrainLayerDefinition {
  textureSourcePath: string;
  textureKey: string;
  tilesetName: string;
  layerId: string;
  tileSize: number;
  columnsPerRow: number;
  firstGid: number;
  fillTile: TerrainTileRef;
}
