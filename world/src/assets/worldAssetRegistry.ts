import type Phaser from "phaser";

const WORLD_TEXTURE_PREFIX = "world";
const WORLD_SPRITE_MODULES = import.meta.glob("../../sprites/**/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export interface WorldTextureAsset {
  readonly key: string;
  readonly sourcePath: string;
  readonly url: string;
}

function toSourcePath(modulePath: string): string {
  return modulePath.replace(/^..\/..\/sprites\//, "");
}

function toTextureKey(sourcePath: string): string {
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

function buildWorldTextureAssets(): WorldTextureAsset[] {
  return Object.entries(WORLD_SPRITE_MODULES)
    .map(([modulePath, url]) => {
      const sourcePath = toSourcePath(modulePath);

      return {
        key: toTextureKey(sourcePath),
        sourcePath,
        url,
      };
    })
    .sort((left, right) => left.key.localeCompare(right.key));
}

const worldTextureAssets = buildWorldTextureAssets();
const textureAssetBySourcePath = new Map(
  worldTextureAssets.map((asset) => [asset.sourcePath, asset]),
);

export function preloadWorldAssets(scene: Phaser.Scene): void {
  for (const asset of worldTextureAssets) {
    if (scene.textures.exists(asset.key)) {
      continue;
    }

    scene.load.image(asset.key, asset.url);
  }
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
