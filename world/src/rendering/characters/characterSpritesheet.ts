import type Phaser from "phaser";

export interface SpritesheetFrameDimensions {
  frameWidth: number;
  frameHeight: number;
}

export function resolveSpritesheetFrameDimensionsFromSize(
  imageWidth: number,
  imageHeight: number,
  configuredWidth: number,
  configuredHeight: number,
): SpritesheetFrameDimensions {
  if (
    imageWidth > imageHeight &&
    imageHeight > 0 &&
    imageWidth % imageHeight === 0
  ) {
    return {
      frameWidth: imageHeight,
      frameHeight: imageHeight,
    };
  }

  const configuredFits =
    configuredWidth > 0 &&
    configuredHeight > 0 &&
    imageWidth % configuredWidth === 0 &&
    imageHeight % configuredHeight === 0;

  if (configuredFits) {
    return {
      frameWidth: configuredWidth,
      frameHeight: configuredHeight,
    };
  }

  return {
    frameWidth: configuredWidth,
    frameHeight: configuredHeight,
  };
}

export function resolveSpritesheetFrameDimensions(
  texture: Phaser.Textures.Texture,
  configuredWidth: number,
  configuredHeight: number,
): SpritesheetFrameDimensions {
  const source = texture.source[0];

  return resolveSpritesheetFrameDimensionsFromSize(
    source.width,
    source.height,
    configuredWidth,
    configuredHeight,
  );
}

export function resolveCharacterFrameIndex(
  texture: Phaser.Textures.Texture,
  frameWidth: number,
  row: number,
  column = 0,
): number {
  const columnsPerRow = Math.max(1, Math.floor(texture.source[0].width / frameWidth));
  const frameIndex = row * columnsPerRow + column;
  const maxFrameIndex = Math.max(0, texture.frameTotal - 1);

  return Math.min(frameIndex, maxFrameIndex);
}

const SPRITE_HEIGHT_RADIUS_MULTIPLIER = 6;

export function resolveCharacterDisplayScale(
  resolvedFrameHeight: number,
  appearanceRadius: number,
  authoredScale: number,
): number {
  const targetHeight = appearanceRadius * SPRITE_HEIGHT_RADIUS_MULTIPLIER * authoredScale;

  return targetHeight / resolvedFrameHeight;
}
