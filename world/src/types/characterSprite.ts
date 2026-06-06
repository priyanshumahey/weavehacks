export const CHARACTER_SPRITE_ANIMATION_KEYS = {
  idle: "idle",
  walk: "walk",
} as const;

export type CharacterSpriteAnimationKey =
  (typeof CHARACTER_SPRITE_ANIMATION_KEYS)[keyof typeof CHARACTER_SPRITE_ANIMATION_KEYS];

export const CHARACTER_SPRITE_FACING = {
  down: "down",
  up: "up",
  left: "left",
  right: "right",
} as const;

export type CharacterSpriteFacing =
  (typeof CHARACTER_SPRITE_FACING)[keyof typeof CHARACTER_SPRITE_FACING];

export interface CharacterSpriteFrameDimensions {
  width: number;
  height: number;
}

export interface CharacterSpriteLabelOffset {
  x: number;
  y: number;
}

export interface CharacterSpriteOrigin {
  x: number;
  y: number;
}

export interface CharacterSpriteAnimationFrameRange {
  row?: number;
  column?: number;
  columnSpan?: number;
  frameIndex?: number;
  startFrame?: number;
  endFrame?: number;
  frameRate: number;
  repeat: number;
}

export type CharacterSpriteAnimationMapping = Record<
  CharacterSpriteFacing,
  CharacterSpriteAnimationFrameRange
>;

export type CharacterSpriteAnimations = Partial<
  Record<CharacterSpriteAnimationKey, CharacterSpriteAnimationMapping>
>;

export interface CharacterSpriteMetadata {
  textureKey: string;
  frameSourcePath?: string;
  animationTextureKeys?: Partial<Record<CharacterSpriteAnimationKey, string>>;
  frame: CharacterSpriteFrameDimensions;
  displayHeight: number;
  scale: number;
  origin: CharacterSpriteOrigin;
  labelOffset: CharacterSpriteLabelOffset;
  animations: CharacterSpriteAnimations;
}

export interface CharacterSpriteDefinition {
  textureKey?: string;
  textureSourcePath?: string;
  frameSourcePath?: string;
  animationTextureSourcePaths?: Partial<
    Record<CharacterSpriteAnimationKey, string>
  >;
  frame?: {
    width?: number;
    height?: number;
  };
  displayHeight?: number;
  scale?: number;
  origin?: {
    x?: number;
    y?: number;
  };
  labelOffset?: {
    x?: number;
    y?: number;
  };
  animations?: Partial<
    Record<
      CharacterSpriteAnimationKey,
      Partial<Record<CharacterSpriteFacing, Partial<CharacterSpriteAnimationFrameRange>>>
    >
  >;
}
