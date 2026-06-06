import {
  deriveWorldTextureKey,
  getWorldTextureAssetByKey,
} from "../../assets/worldAssetRegistry";
import type { PropSpriteDefinition, PropSpriteMetadata } from "../../types/propSprite";

const DEFAULT_SCALE = 1;
const DEFAULT_ORIGIN = {
  x: 0.5,
  y: 1,
} as const;
const DEFAULT_COLLISION_RADIUS = 24;
const COLLISION_RADIUS_TEXTURE_FACTOR = 0.18;

function resolveTextureKey(
  propId: string,
  sprite: PropSpriteDefinition | undefined,
): string {
  const normalizedTextureKey = sprite?.textureKey?.trim();
  const normalizedTextureSourcePath = sprite?.textureSourcePath?.trim();

  if (normalizedTextureKey && normalizedTextureSourcePath) {
    throw new Error(
      `Prop "${propId}" sprite must define either textureKey or textureSourcePath, not both.`,
    );
  }

  if (normalizedTextureKey) {
    return normalizedTextureKey;
  }

  if (!normalizedTextureSourcePath) {
    throw new Error(`Prop "${propId}" sprite must define textureKey or textureSourcePath.`);
  }

  return deriveWorldTextureKey(normalizedTextureSourcePath);
}

function resolveDefaultCollisionRadius(textureKey: string, scale: number): number {
  const asset = getWorldTextureAssetByKey(textureKey);

  if (!asset) {
    return DEFAULT_COLLISION_RADIUS;
  }

  const baseRadius =
    Math.min(asset.width, asset.height) * COLLISION_RADIUS_TEXTURE_FACTOR * scale;

  return Math.max(DEFAULT_COLLISION_RADIUS * 0.5, baseRadius);
}

export function normalizePropSprite(
  propId: string,
  sprite: PropSpriteDefinition | undefined,
): PropSpriteMetadata {
  const textureKey = resolveTextureKey(propId, sprite);
  const scale = sprite?.scale ?? DEFAULT_SCALE;

  if (typeof scale !== "number" || Number.isNaN(scale) || scale <= 0) {
    throw new Error(`Prop "${propId}" sprite scale must be a positive number.`);
  }

  const origin = {
    x: sprite?.origin?.x ?? DEFAULT_ORIGIN.x,
    y: sprite?.origin?.y ?? DEFAULT_ORIGIN.y,
  };

  if (typeof origin.x !== "number" || Number.isNaN(origin.x) || origin.x < 0 || origin.x > 1) {
    throw new Error(`Prop "${propId}" sprite origin.x must be a number between 0 and 1.`);
  }

  if (typeof origin.y !== "number" || Number.isNaN(origin.y) || origin.y < 0 || origin.y > 1) {
    throw new Error(`Prop "${propId}" sprite origin.y must be a number between 0 and 1.`);
  }

  const collisionRadius = sprite?.collisionRadius ?? resolveDefaultCollisionRadius(textureKey, scale);

  if (typeof collisionRadius !== "number" || Number.isNaN(collisionRadius) || collisionRadius <= 0) {
    throw new Error(`Prop "${propId}" sprite collisionRadius must be a positive number.`);
  }

  return {
    textureKey,
    scale,
    origin: {
      x: origin.x,
      y: origin.y,
    },
    collisionRadius,
  };
}
