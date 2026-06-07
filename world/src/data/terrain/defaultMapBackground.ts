import { deriveWorldTextureKey } from "../../assets/worldAssetRegistry";
import {
  MAP_TEXTURE_SOURCE_PATHS,
  type MapBackgroundDefinition,
} from "../../types/terrain";

export const defaultMapBackground: MapBackgroundDefinition = {
  textureSourcePath: MAP_TEXTURE_SOURCE_PATHS.redKeep,
  textureKey: deriveWorldTextureKey(MAP_TEXTURE_SOURCE_PATHS.redKeep),
  width: 1254,
  height: 1254,
};
