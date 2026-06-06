import { deriveWorldTextureKey } from "../../assets/worldAssetRegistry";
import type {
  CharacterSpriteAnimationFrameRange,
  CharacterSpriteAnimationKey,
  CharacterSpriteAnimationMapping,
  CharacterSpriteAnimations,
  CharacterSpriteDefinition,
  CharacterSpriteFacing,
  CharacterSpriteMetadata,
} from "../../types/characterSprite";
import {
  CHARACTER_SPRITE_ANIMATION_KEYS,
  CHARACTER_SPRITE_FACING,
} from "../../types/characterSprite";

const DEFAULT_FRAME = {
  width: 32,
  height: 32,
} as const;

const DEFAULT_SCALE = 1;
const DEFAULT_ANIMATION_FRAME_RATE = 8;
const DEFAULT_ANIMATION_REPEAT = -1;

const FACING_ORDER: CharacterSpriteFacing[] = [
  CHARACTER_SPRITE_FACING.down,
  CHARACTER_SPRITE_FACING.left,
  CHARACTER_SPRITE_FACING.right,
  CHARACTER_SPRITE_FACING.up,
];

function defaultTextureSourcePath(characterId: string): string {
  return `characters/${characterId}.png`;
}

function defaultLabelOffset(radius: number): { x: number; y: number } {
  return {
    x: 0,
    y: radius + 14,
  };
}

function defaultAnimationMapping(
  startRow: number,
  frameRate = DEFAULT_ANIMATION_FRAME_RATE,
): CharacterSpriteAnimationMapping {
  return FACING_ORDER.reduce<CharacterSpriteAnimationMapping>((mapping, facing, index) => {
    mapping[facing] = {
      row: startRow + index,
      frameRate,
      repeat: DEFAULT_ANIMATION_REPEAT,
    };
    return mapping;
  }, {} as CharacterSpriteAnimationMapping);
}

function defaultAnimations(): CharacterSpriteAnimations {
  return {
    [CHARACTER_SPRITE_ANIMATION_KEYS.idle]: defaultAnimationMapping(0, 6),
    [CHARACTER_SPRITE_ANIMATION_KEYS.walk]: defaultAnimationMapping(4, 8),
  };
}

function normalizeAnimationFrameRange(
  value: Partial<CharacterSpriteAnimationFrameRange> | undefined,
  characterId: string,
  animationKey: CharacterSpriteAnimationKey,
  facing: CharacterSpriteFacing,
  fallbackRow: number,
): CharacterSpriteAnimationFrameRange {
  const row = value?.row ?? fallbackRow;

  if (typeof row !== "number" || Number.isNaN(row) || row < 0) {
    throw new Error(
      `Character "${characterId}" sprite animation "${animationKey}.${facing}" row must be a non-negative number.`,
    );
  }

  const frameRate = value?.frameRate ?? DEFAULT_ANIMATION_FRAME_RATE;

  if (typeof frameRate !== "number" || Number.isNaN(frameRate) || frameRate <= 0) {
    throw new Error(
      `Character "${characterId}" sprite animation "${animationKey}.${facing}" frameRate must be a positive number.`,
    );
  }

  const repeat = value?.repeat ?? DEFAULT_ANIMATION_REPEAT;

  if (typeof repeat !== "number" || Number.isNaN(repeat)) {
    throw new Error(
      `Character "${characterId}" sprite animation "${animationKey}.${facing}" repeat must be a number.`,
    );
  }

  return {
    row,
    frameRate,
    repeat,
  };
}

function normalizeAnimationMapping(
  definition:
    | Partial<Record<CharacterSpriteFacing, Partial<CharacterSpriteAnimationFrameRange>>>
    | undefined,
  characterId: string,
  animationKey: CharacterSpriteAnimationKey,
  fallback: CharacterSpriteAnimationMapping,
): CharacterSpriteAnimationMapping {
  return FACING_ORDER.reduce<CharacterSpriteAnimationMapping>((mapping, facing, index) => {
    mapping[facing] = normalizeAnimationFrameRange(
      definition?.[facing],
      characterId,
      animationKey,
      facing,
      fallback[facing].row ?? index,
    );
    return mapping;
  }, {} as CharacterSpriteAnimationMapping);
}

function normalizeAnimations(
  definition: CharacterSpriteDefinition["animations"] | undefined,
  characterId: string,
  fallback: CharacterSpriteAnimations,
): CharacterSpriteAnimations {
  const animationKeys = Object.values(CHARACTER_SPRITE_ANIMATION_KEYS);

  return animationKeys.reduce<CharacterSpriteAnimations>((animations, animationKey) => {
    const fallbackMapping = fallback[animationKey];

    if (!fallbackMapping) {
      return animations;
    }

    animations[animationKey] = normalizeAnimationMapping(
      definition?.[animationKey],
      characterId,
      animationKey,
      fallbackMapping,
    );
    return animations;
  }, {});
}

function resolveTextureKey(
  characterId: string,
  sprite: CharacterSpriteDefinition | undefined,
): string {
  const textureKey = sprite?.textureKey?.trim();
  const textureSourcePath = sprite?.textureSourcePath?.trim();

  if (textureKey && textureSourcePath) {
    throw new Error(
      `Character "${characterId}" sprite must define either textureKey or textureSourcePath, not both.`,
    );
  }

  if (textureKey) {
    return textureKey;
  }

  return deriveWorldTextureKey(textureSourcePath ?? defaultTextureSourcePath(characterId));
}

export function normalizeCharacterSprite(
  characterId: string,
  sprite: CharacterSpriteDefinition | undefined,
  appearanceRadius: number,
): CharacterSpriteMetadata {
  const fallbackAnimations = defaultAnimations();
  const labelOffset = {
    ...defaultLabelOffset(appearanceRadius),
    ...(sprite?.labelOffset ?? {}),
  };

  const frameWidth = sprite?.frame?.width ?? DEFAULT_FRAME.width;
  const frameHeight = sprite?.frame?.height ?? DEFAULT_FRAME.height;

  if (typeof frameWidth !== "number" || Number.isNaN(frameWidth) || frameWidth <= 0) {
    throw new Error(`Character "${characterId}" sprite frame width must be a positive number.`);
  }

  if (typeof frameHeight !== "number" || Number.isNaN(frameHeight) || frameHeight <= 0) {
    throw new Error(`Character "${characterId}" sprite frame height must be a positive number.`);
  }

  const scale = sprite?.scale ?? DEFAULT_SCALE;

  if (typeof scale !== "number" || Number.isNaN(scale) || scale <= 0) {
    throw new Error(`Character "${characterId}" sprite scale must be a positive number.`);
  }

  return {
    textureKey: resolveTextureKey(characterId, sprite),
    frame: {
      width: frameWidth,
      height: frameHeight,
    },
    scale,
    labelOffset: {
      x: labelOffset.x,
      y: labelOffset.y,
    },
    animations: normalizeAnimations(sprite?.animations, characterId, fallbackAnimations),
  };
}
