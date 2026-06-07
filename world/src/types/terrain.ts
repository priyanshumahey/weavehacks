export const MAP_TEXTURE_SOURCE_PATHS = {
  redKeep: "maps/red_keep.png",
  throneRoom: "maps/throne_room.png",
  winterfell: "maps/winterfell.png",
  wall: "maps/wall.png",
  vaesDothrak: "maps/vaes_dothrak.png",
  dragonstone: "maps/dragonstone.png",
} as const;

export interface MapBackgroundDefinition {
  textureSourcePath: string;
  textureKey: string;
  width: number;
  height: number;
}
