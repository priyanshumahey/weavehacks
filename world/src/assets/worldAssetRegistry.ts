import type Phaser from "phaser";
import spriteDimensions from "./spriteDimensions.json";

const WORLD_TEXTURE_PREFIX = "world";
const WORLD_SPRITE_MODULES = import.meta.glob("../../sprites/**/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

function isDialoguePortraitModule(modulePath: string): boolean {
  return modulePath.includes("/sprites/Characters/");
}

const WORLD_TEXTURE_MODULES = {
  ...Object.fromEntries(
    Object.entries(WORLD_SPRITE_MODULES).filter(
      ([modulePath]) => !isDialoguePortraitModule(modulePath),
    ),
  ),
  ...import.meta.glob("../../charsets/sprites/**/*.png", {
    eager: true,
    import: "default",
  }),
};

export interface WorldTextureAsset {
  readonly key: string;
  readonly sourcePath: string;
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

function toSourcePath(modulePath: string): string {
  if (modulePath.startsWith("../../charsets/")) {
    return modulePath.replace(/^..\/..\/charsets\//, "charsets/");
  }

  return modulePath.replace(/^..\/..\/sprites\//, "");
}

export function deriveWorldTextureKey(sourcePath: string): string {
  const normalizedPath = sourcePath
    .replace(/\.png$/i, "")
    .split("/")
    .map((segment) =>
      segment
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("/");

  return `${WORLD_TEXTURE_PREFIX}/${normalizedPath}`;
}

const spriteDimensionsBySourcePath = spriteDimensions as Record<
  string,
  { width: number; height: number }
>;

function buildWorldTextureAssets(): WorldTextureAsset[] {
  return Object.entries(WORLD_TEXTURE_MODULES)
    .map(([modulePath, url]) => {
      const sourcePath = toSourcePath(modulePath);
      const dimensions = spriteDimensionsBySourcePath[sourcePath];

      if (!dimensions) {
        throw new Error(`Missing sprite dimensions for ${sourcePath}`);
      }

      return {
        key: deriveWorldTextureKey(sourcePath),
        sourcePath,
        url,
        width: dimensions.width,
        height: dimensions.height,
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

const worldTextureAssets = buildWorldTextureAssets();
const textureAssetBySourcePath = new Map(
  worldTextureAssets.map((asset) => [asset.sourcePath, asset]),
);
const textureAssetByKey = new Map(
  worldTextureAssets.map((asset) => [asset.key, asset]),
);

export function preloadWorldAssets(
  scene: Phaser.Scene,
  skipKeys: ReadonlySet<string> = new Set(),
): void {
  for (const asset of worldTextureAssets) {
    if (skipKeys.has(asset.key) || scene.textures.exists(asset.key)) {
      continue;
    }

    scene.load.image(asset.key, asset.url);
  }
}

export function getWorldTextureAssetByKey(key: string): WorldTextureAsset | undefined {
  return textureAssetByKey.get(key);
}

export function getWorldTextureKey(sourcePath: string): string {
  const asset = textureAssetBySourcePath.get(sourcePath);

  if (!asset) {
    throw new Error(`Unknown world texture asset: ${sourcePath}`);
  }

  return asset.key;
}

export function listWorldTextureAssets(): readonly WorldTextureAsset[] {
  return worldTextureAssets;
}
