import { deriveWorldTextureKey } from "../../assets/worldAssetRegistry";
import {
  MAP_TEXTURE_SOURCE_PATHS,
  type MapBackgroundDefinition,
} from "../../types/terrain";

export const defaultMapBackground: MapBackgroundDefinition = {
  textureSourcePath: MAP_TEXTURE_SOURCE_PATHS.throneRoom,
  textureKey: deriveWorldTextureKey(MAP_TEXTURE_SOURCE_PATHS.throneRoom),
  width: 1024,
  height: 1536,
};
