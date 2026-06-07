export const MAP_TEXTURE_SOURCE_PATHS = {
  redKeep: "maps/red_keep.png",
} as const;

export interface MapBackgroundDefinition {
  textureSourcePath: string;
  textureKey: string;
  width: number;
  height: number;
}
