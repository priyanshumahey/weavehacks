import type Phaser from "phaser";
import {
  deriveWorldTextureKey,
  getWorldTextureAssetByKey,
} from "../../assets/worldAssetRegistry";
import type { CharacterDefinition } from "../../types/character";
import {
  collectCharsetFrameTextureKeysFromPaths,
  preloadCharsetFrames,
} from "./preloadCharsetFrames";
import { resolveSpritesheetFrameDimensionsFromSize } from "./characterSpritesheet";

const DEFAULT_FRAME_WIDTH = 32;
const DEFAULT_FRAME_HEIGHT = 32;

interface CharacterSpritesheetLoad {
  key: string;
  url: string;
  frameWidth: number;
  frameHeight: number;
  imageWidth: number;
  imageHeight: number;
}

function resolveTextureKey(
  characterId: string,
  textureKey: string | undefined,
  textureSourcePath: string | undefined,
): string {
  if (textureKey?.trim()) {
    return textureKey.trim();
  }

  return deriveWorldTextureKey(
    textureSourcePath?.trim() ?? `characters/${characterId}.png`,
  );
}

function resolveTextureAsset(key: string, sourcePath: string | undefined) {
  if (sourcePath?.trim()) {
    return getWorldTextureAssetByKey(deriveWorldTextureKey(sourcePath.trim()));
  }

  return getWorldTextureAssetByKey(key);
}

function collectFrameSourcePaths(definition: CharacterDefinition): string[] {
  const frameSourcePath = definition.sprite?.frameSourcePath?.trim();

  return frameSourcePath ? [frameSourcePath] : [];
}

function collectSpritesheetLoads(definition: CharacterDefinition): CharacterSpritesheetLoad[] {
  const sprite = definition.sprite;

  if (!sprite || sprite.frameSourcePath?.trim()) {
    return [];
  }

  const frameWidth = sprite.frame?.width ?? DEFAULT_FRAME_WIDTH;
  const frameHeight = sprite.frame?.height ?? DEFAULT_FRAME_HEIGHT;
  const loads: CharacterSpritesheetLoad[] = [];

  const primaryKey = resolveTextureKey(
    definition.id,
    sprite.textureKey,
    sprite.textureSourcePath,
  );
  const primaryAsset = resolveTextureAsset(primaryKey, sprite.textureSourcePath);

  if (primaryAsset) {
    loads.push({
      key: primaryKey,
      url: primaryAsset.url,
      frameWidth,
      frameHeight,
      imageWidth: primaryAsset.width,
      imageHeight: primaryAsset.height,
    });
  }

  if (sprite.animationTextureSourcePaths) {
    for (const sourcePath of Object.values(sprite.animationTextureSourcePaths)) {
      const normalizedSourcePath = sourcePath?.trim();

      if (!normalizedSourcePath) {
        continue;
      }

      const key = deriveWorldTextureKey(normalizedSourcePath);
      const asset = getWorldTextureAssetByKey(key);

      if (asset) {
        loads.push({
          key,
          url: asset.url,
          frameWidth,
          frameHeight,
          imageWidth: asset.width,
          imageHeight: asset.height,
        });
      }
    }
  }

  return loads;
}

export function collectCharacterTextureKeys(
  definitions: readonly CharacterDefinition[],
): Set<string> {
  const keys = new Set<string>();
  const frameSourcePaths: string[] = [];

  for (const definition of definitions) {
    frameSourcePaths.push(...collectFrameSourcePaths(definition));

    for (const load of collectSpritesheetLoads(definition)) {
      keys.add(load.key);
    }
  }

  for (const key of collectCharsetFrameTextureKeysFromPaths(frameSourcePaths)) {
    keys.add(key);
  }

  return keys;
}

export function preloadCharacterSpritesheets(
  scene: Phaser.Scene,
  definitions: readonly CharacterDefinition[],
): void {
  const frameSourcePaths = definitions.flatMap(collectFrameSourcePaths);

  preloadCharsetFrames(scene, frameSourcePaths);

  const queued = new Set<string>();

  for (const definition of definitions) {
    for (const load of collectSpritesheetLoads(definition)) {
      if (queued.has(load.key) || scene.textures.exists(load.key)) {
        continue;
      }

      const frameDimensions = resolveSpritesheetFrameDimensionsFromSize(
        load.imageWidth,
        load.imageHeight,
        load.frameWidth,
        load.frameHeight,
      );

      scene.load.spritesheet(load.key, load.url, {
        frameWidth: frameDimensions.frameWidth,
        frameHeight: frameDimensions.frameHeight,
      });
      queued.add(load.key);
    }
  }
}
