import type Phaser from "phaser";
import { getWorldTextureAssetByKey } from "../../assets/worldAssetRegistry";
import { listCharsetFrameTextureKeys } from "./charsetFrames";

export function collectCharsetFrameTextureKeysFromPaths(
  frameSourcePaths: readonly string[],
): Set<string> {
  const keys = new Set<string>();

  for (const frameSourcePath of frameSourcePaths) {
    for (const key of listCharsetFrameTextureKeys(frameSourcePath)) {
      keys.add(key);
    }
  }

  return keys;
}

export function preloadCharsetFrames(
  scene: Phaser.Scene,
  frameSourcePaths: readonly string[],
): void {
  const queued = new Set<string>();

  for (const frameSourcePath of frameSourcePaths) {
    for (const key of listCharsetFrameTextureKeys(frameSourcePath)) {
      if (queued.has(key) || scene.textures.exists(key)) {
        continue;
      }

      const asset = getWorldTextureAssetByKey(key);

      if (!asset) {
        continue;
      }

      scene.load.image(key, asset.url);
      queued.add(key);
    }
  }
}
