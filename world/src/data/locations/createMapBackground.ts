import { deriveWorldTextureKey } from "../../assets/worldAssetRegistry";
import type { MapBackgroundDefinition } from "../../types/terrain";

export function createMapBackground(
  textureSourcePath: string,
  width: number,
  height: number,
): MapBackgroundDefinition {
  return {
    textureSourcePath,
    textureKey: deriveWorldTextureKey(textureSourcePath),
    width,
    height,
  };
}
