import { deriveWorldTextureKey } from "../../assets/worldAssetRegistry";
import {
  CHARACTER_SPRITE_ANIMATION_KEYS,
  CHARACTER_SPRITE_FACING,
  type CharacterSpriteAnimationMapping,
  type CharacterSpriteFacing,
} from "../../types/characterSprite";

export const CHARSET_FRAME_COUNT = 3;
export const CHARSET_IDLE_FRAME_INDEX = 1;

const FACING_ORDER: CharacterSpriteFacing[] = [
  CHARACTER_SPRITE_FACING.down,
  CHARACTER_SPRITE_FACING.left,
  CHARACTER_SPRITE_FACING.right,
  CHARACTER_SPRITE_FACING.up,
];

export function buildCharsetFrameSourcePath(characterName: string): string {
  return `charsets/sprites/${characterName}`;
}

export function resolveCharsetFrameSourcePath(
  frameSourcePath: string,
  facing: CharacterSpriteFacing,
  frameIndex: number,
): string {
  return `${frameSourcePath}/${facing}_${frameIndex}.png`;
}

export function resolveCharsetFrameTextureKey(
  frameSourcePath: string,
  facing: CharacterSpriteFacing,
  frameIndex: number,
): string {
  return deriveWorldTextureKey(
    resolveCharsetFrameSourcePath(frameSourcePath, facing, frameIndex),
  );
}

export function listCharsetFrameTextureKeys(frameSourcePath: string): string[] {
  const keys: string[] = [];

  for (const facing of FACING_ORDER) {
    for (let frameIndex = 0; frameIndex < CHARSET_FRAME_COUNT; frameIndex += 1) {
      keys.push(resolveCharsetFrameTextureKey(frameSourcePath, facing, frameIndex));
    }
  }

  return keys;
}

export function defaultCharsetIdleAnimationMapping(): CharacterSpriteAnimationMapping {
  return FACING_ORDER.reduce<CharacterSpriteAnimationMapping>((mapping, facing) => {
    mapping[facing] = {
      frameIndex: CHARSET_IDLE_FRAME_INDEX,
      frameRate: 6,
      repeat: -1,
    };
    return mapping;
  }, {} as CharacterSpriteAnimationMapping);
}

export function defaultCharsetWalkAnimationMapping(): CharacterSpriteAnimationMapping {
  return FACING_ORDER.reduce<CharacterSpriteAnimationMapping>((mapping, facing) => {
    mapping[facing] = {
      startFrame: 0,
      endFrame: CHARSET_FRAME_COUNT - 1,
      frameRate: 8,
      repeat: -1,
    };
    return mapping;
  }, {} as CharacterSpriteAnimationMapping);
}

export function defaultCharsetAnimations() {
  return {
    [CHARACTER_SPRITE_ANIMATION_KEYS.idle]: defaultCharsetIdleAnimationMapping(),
    [CHARACTER_SPRITE_ANIMATION_KEYS.walk]: defaultCharsetWalkAnimationMapping(),
  };
}
