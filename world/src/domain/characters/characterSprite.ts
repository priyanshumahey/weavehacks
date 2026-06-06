import { deriveWorldTextureKey } from "../../assets/worldAssetRegistry";
import {
  CHARSET_IDLE_FRAME_INDEX,
  defaultCharsetAnimations,
  resolveCharsetFrameTextureKey,
} from "../../rendering/characters/charsetFrames";
import { resolveDefaultCharacterDisplayHeight } from "../../rendering/characters/characterSpritesheet";
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
const DEFAULT_ORIGIN = {
  x: 0.5,
  y: 0.5,
} as const;
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

function defaultLabelOffset(): { x: number; y: number } {
  return {
    x: 0,
    y: 0,
  };
}

function defaultOrigin(): { x: number; y: number } {
  return {
    x: DEFAULT_ORIGIN.x,
    y: DEFAULT_ORIGIN.y,
  };
}

function defaultAnimationMapping(
  startRow: number,
  frameRate = DEFAULT_ANIMATION_FRAME_RATE,
  startColumn = 0,
): CharacterSpriteAnimationMapping {
  return FACING_ORDER.reduce<CharacterSpriteAnimationMapping>((mapping, facing, index) => {
    mapping[facing] = {
      row: startRow + index,
      column: startColumn,
      frameRate,
      repeat: DEFAULT_ANIMATION_REPEAT,
    };
    return mapping;
  }, {} as CharacterSpriteAnimationMapping);
}

function defaultIdleAnimationMapping(): CharacterSpriteAnimationMapping {
  return FACING_ORDER.reduce<CharacterSpriteAnimationMapping>((mapping, facing) => {
    mapping[facing] = {
      row: 0,
      column: 0,
      frameRate: 6,
      repeat: DEFAULT_ANIMATION_REPEAT,
    };
    return mapping;
  }, {} as CharacterSpriteAnimationMapping);
}

function defaultAnimations(): CharacterSpriteAnimations {
  return {
    [CHARACTER_SPRITE_ANIMATION_KEYS.idle]: defaultIdleAnimationMapping(),
    [CHARACTER_SPRITE_ANIMATION_KEYS.walk]: defaultAnimationMapping(0, 8),
  };
}

function normalizeAnimationTiming(
  value: Partial<CharacterSpriteAnimationFrameRange> | undefined,
  characterId: string,
  animationKey: CharacterSpriteAnimationKey,
  facing: CharacterSpriteFacing,
  fallback: CharacterSpriteAnimationFrameRange,
): Pick<CharacterSpriteAnimationFrameRange, "frameRate" | "repeat"> {
  const frameRate = value?.frameRate ?? fallback.frameRate;

  if (typeof frameRate !== "number" || Number.isNaN(frameRate) || frameRate <= 0) {
    throw new Error(
      `Character "${characterId}" sprite animation "${animationKey}.${facing}" frameRate must be a positive number.`,
    );
  }

  const repeat = value?.repeat ?? fallback.repeat;

  if (typeof repeat !== "number" || Number.isNaN(repeat)) {
    throw new Error(
      `Character "${characterId}" sprite animation "${animationKey}.${facing}" repeat must be a number.`,
    );
  }

  return { frameRate, repeat };
}

function normalizeSpritesheetAnimationFrameRange(
  value: Partial<CharacterSpriteAnimationFrameRange> | undefined,
  characterId: string,
  animationKey: CharacterSpriteAnimationKey,
  facing: CharacterSpriteFacing,
  fallbackRow: number,
  fallbackColumn: number,
  fallback: CharacterSpriteAnimationFrameRange,
): CharacterSpriteAnimationFrameRange {
  const row = value?.row ?? fallbackRow;
  const column = value?.column ?? fallbackColumn;

  if (typeof column !== "number" || Number.isNaN(column) || column < 0) {
    throw new Error(
      `Character "${characterId}" sprite animation "${animationKey}.${facing}" column must be a non-negative number.`,
    );
  }

  if (typeof row !== "number" || Number.isNaN(row) || row < 0) {
    throw new Error(
      `Character "${characterId}" sprite animation "${animationKey}.${facing}" row must be a non-negative number.`,
    );
  }

  const columnSpan = value?.columnSpan;

  if (columnSpan != null) {
    if (typeof columnSpan !== "number" || Number.isNaN(columnSpan) || columnSpan <= 0) {
      throw new Error(
        `Character "${characterId}" sprite animation "${animationKey}.${facing}" columnSpan must be a positive number.`,
      );
    }
  }

  return {
    row,
    column,
    ...(columnSpan != null ? { columnSpan } : {}),
    ...normalizeAnimationTiming(value, characterId, animationKey, facing, fallback),
  };
}

function normalizeCharsetAnimationFrameRange(
  value: Partial<CharacterSpriteAnimationFrameRange> | undefined,
  characterId: string,
  animationKey: CharacterSpriteAnimationKey,
  facing: CharacterSpriteFacing,
  fallback: CharacterSpriteAnimationFrameRange,
): CharacterSpriteAnimationFrameRange {
  const frameIndex = value?.frameIndex ?? fallback.frameIndex;
  const startFrame = value?.startFrame ?? fallback.startFrame;
  const endFrame = value?.endFrame ?? fallback.endFrame;

  if (frameIndex != null) {
    if (typeof frameIndex !== "number" || Number.isNaN(frameIndex) || frameIndex < 0) {
      throw new Error(
        `Character "${characterId}" sprite animation "${animationKey}.${facing}" frameIndex must be a non-negative number.`,
      );
    }

    return {
      frameIndex,
      ...normalizeAnimationTiming(value, characterId, animationKey, facing, fallback),
    };
  }

  if (
    typeof startFrame !== "number" ||
    Number.isNaN(startFrame) ||
    startFrame < 0 ||
    typeof endFrame !== "number" ||
    Number.isNaN(endFrame) ||
    endFrame < startFrame
  ) {
    throw new Error(
      `Character "${characterId}" sprite animation "${animationKey}.${facing}" must define a valid startFrame/endFrame range.`,
    );
  }

  return {
    startFrame,
    endFrame,
    ...normalizeAnimationTiming(value, characterId, animationKey, facing, fallback),
  };
}

function normalizeAnimationMapping(
  definition:
    | Partial<Record<CharacterSpriteFacing, Partial<CharacterSpriteAnimationFrameRange>>>
    | undefined,
  characterId: string,
  animationKey: CharacterSpriteAnimationKey,
  fallback: CharacterSpriteAnimationMapping,
  useFrameSequence: boolean,
): CharacterSpriteAnimationMapping {
  return FACING_ORDER.reduce<CharacterSpriteAnimationMapping>((mapping, facing, index) => {
    mapping[facing] = useFrameSequence
      ? normalizeCharsetAnimationFrameRange(
          definition?.[facing],
          characterId,
          animationKey,
          facing,
          fallback[facing],
        )
      : normalizeSpritesheetAnimationFrameRange(
          definition?.[facing],
          characterId,
          animationKey,
          facing,
          fallback[facing].row ?? index,
          fallback[facing].column ?? 0,
          fallback[facing],
        );
    return mapping;
  }, {} as CharacterSpriteAnimationMapping);
}

function normalizeAnimations(
  definition: CharacterSpriteDefinition["animations"] | undefined,
  characterId: string,
  fallback: CharacterSpriteAnimations,
  useFrameSequence: boolean,
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
      useFrameSequence,
    );
    return animations;
  }, {});
}

function resolveTextureKeyFromSource(
  characterId: string,
  textureKey: string | undefined,
  textureSourcePath: string | undefined,
  fieldLabel: string,
): string {
  const normalizedTextureKey = textureKey?.trim();
  const normalizedTextureSourcePath = textureSourcePath?.trim();

  if (normalizedTextureKey && normalizedTextureSourcePath) {
    throw new Error(
      `Character "${characterId}" sprite ${fieldLabel} must define either textureKey or textureSourcePath, not both.`,
    );
  }

  if (normalizedTextureKey) {
    return normalizedTextureKey;
  }

  return deriveWorldTextureKey(
    normalizedTextureSourcePath ?? defaultTextureSourcePath(characterId),
  );
}

function resolveTextureKey(
  characterId: string,
  sprite: CharacterSpriteDefinition | undefined,
): string {
  const frameSourcePath = sprite?.frameSourcePath?.trim();

  if (frameSourcePath) {
    return resolveCharsetFrameTextureKey(
      frameSourcePath,
      CHARACTER_SPRITE_FACING.down,
      CHARSET_IDLE_FRAME_INDEX,
    );
  }

  return resolveTextureKeyFromSource(
    characterId,
    sprite?.textureKey,
    sprite?.textureSourcePath,
    "texture",
  );
}

function normalizeAnimationTextureKeys(
  characterId: string,
  sprite: CharacterSpriteDefinition | undefined,
): Partial<Record<CharacterSpriteAnimationKey, string>> | undefined {
  const animationTextureSourcePaths = sprite?.animationTextureSourcePaths;

  if (!animationTextureSourcePaths) {
    return undefined;
  }

  const animationKeys = Object.values(CHARACTER_SPRITE_ANIMATION_KEYS);

  return animationKeys.reduce<Partial<Record<CharacterSpriteAnimationKey, string>>>(
    (animationTextureKeys, animationKey) => {
      const textureSourcePath = animationTextureSourcePaths[animationKey]?.trim();

      if (!textureSourcePath) {
        return animationTextureKeys;
      }

      animationTextureKeys[animationKey] = deriveWorldTextureKey(textureSourcePath);
      return animationTextureKeys;
    },
    {},
  );
}

export function normalizeCharacterSprite(
  characterId: string,
  sprite: CharacterSpriteDefinition | undefined,
  appearanceRadius: number,
): CharacterSpriteMetadata {
  const frameSourcePath = sprite?.frameSourcePath?.trim();
  const textureSourcePath = sprite?.textureSourcePath?.trim();

  if (frameSourcePath && textureSourcePath) {
    throw new Error(
      `Character "${characterId}" sprite must define either textureSourcePath or frameSourcePath, not both.`,
    );
  }

  const useFrameSequence = Boolean(frameSourcePath);
  const fallbackAnimations = useFrameSequence
    ? defaultCharsetAnimations()
    : defaultAnimations();
  const labelOffset = {
    ...defaultLabelOffset(),
    ...(sprite?.labelOffset ?? {}),
  };
  const origin = {
    ...defaultOrigin(),
    ...(sprite?.origin ?? {}),
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

  const displayHeight =
    sprite?.displayHeight ?? resolveDefaultCharacterDisplayHeight(appearanceRadius, scale);

  if (typeof displayHeight !== "number" || Number.isNaN(displayHeight) || displayHeight <= 0) {
    throw new Error(`Character "${characterId}" sprite displayHeight must be a positive number.`);
  }

  if (
    typeof origin.x !== "number" ||
    Number.isNaN(origin.x) ||
    origin.x < 0 ||
    origin.x > 1
  ) {
    throw new Error(`Character "${characterId}" sprite origin.x must be between 0 and 1.`);
  }

  if (
    typeof origin.y !== "number" ||
    Number.isNaN(origin.y) ||
    origin.y < 0 ||
    origin.y > 1
  ) {
    throw new Error(`Character "${characterId}" sprite origin.y must be between 0 and 1.`);
  }

  const animationTextureKeys = normalizeAnimationTextureKeys(characterId, sprite);

  return {
    textureKey: resolveTextureKey(characterId, sprite),
    ...(frameSourcePath ? { frameSourcePath } : {}),
    ...(animationTextureKeys && Object.keys(animationTextureKeys).length > 0
      ? { animationTextureKeys }
      : {}),
    frame: {
      width: frameWidth,
      height: frameHeight,
    },
    displayHeight,
    scale,
    origin: {
      x: origin.x,
      y: origin.y,
    },
    labelOffset: {
      x: labelOffset.x,
      y: labelOffset.y,
    },
    animations: normalizeAnimations(
      sprite?.animations,
      characterId,
      fallbackAnimations,
      useFrameSequence,
    ),
  };
}
