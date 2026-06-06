import Phaser from "phaser";
import {
  ensureCharacterSpritesheet,
  resolveCharacterFrameIndex,
  resolveSpritesheetFrameDimensions,
} from "./characterSpritesheet";
import {
  CHARACTER_SPRITE_ANIMATION_KEYS,
  CHARACTER_SPRITE_FACING,
  type CharacterSpriteAnimationKey,
  type CharacterSpriteFacing,
  type CharacterSpriteMetadata,
} from "../../types/characterSprite";

const SIDE_VIEW_CANONICAL_FACING = CHARACTER_SPRITE_FACING.down;

export interface CharacterSpritePlaybackState {
  textureKey: string;
  animationKey: CharacterSpriteAnimationKey;
  facing: CharacterSpriteFacing;
  flipX: boolean;
}

function resolveTextureKey(
  sprite: CharacterSpriteMetadata,
  animationKey: CharacterSpriteAnimationKey,
): string {
  return sprite.animationTextureKeys?.[animationKey] ?? sprite.textureKey;
}

function isSingleRowSpritesheet(texture: Phaser.Textures.Texture, frameHeight: number): boolean {
  return texture.source[0].height <= frameHeight;
}

function resolvePlaybackFacing(
  texture: Phaser.Textures.Texture,
  frameHeight: number,
  facing: CharacterSpriteFacing,
): { facing: CharacterSpriteFacing; flipX: boolean } {
  if (!isSingleRowSpritesheet(texture, frameHeight)) {
    return { facing, flipX: false };
  }

  return {
    facing: SIDE_VIEW_CANONICAL_FACING,
    flipX: facing === CHARACTER_SPRITE_FACING.left,
  };
}

function getRowFrameBounds(
  texture: Phaser.Textures.Texture,
  frameWidth: number,
  row: number,
): { start: number; end: number } {
  const columnsPerRow = Math.max(1, Math.floor(texture.source[0].width / frameWidth));
  const start = row * columnsPerRow;
  const end = Math.min(start + columnsPerRow - 1, texture.frameTotal - 1);

  return { start, end };
}

export function buildCharacterAnimationKey(
  characterId: string,
  textureKey: string,
  animationKey: CharacterSpriteAnimationKey,
  facing: CharacterSpriteFacing,
): string {
  return `${characterId}:${textureKey}:${animationKey}:${facing}`;
}

export function resolveCharacterSpritePlayback(
  sprite: CharacterSpriteMetadata,
  animationKey: CharacterSpriteAnimationKey,
  facing: CharacterSpriteFacing,
  scene: Phaser.Scene,
): CharacterSpritePlaybackState | null {
  const textureKey = resolveTextureKey(sprite, animationKey);

  if (!scene.textures.exists(textureKey)) {
    return null;
  }

  const texture = scene.textures.get(textureKey);
  const resolvedFrame = resolveSpritesheetFrameDimensions(
    texture,
    sprite.frame.width,
    sprite.frame.height,
  );
  const spritesheetReady = ensureCharacterSpritesheet(
    scene,
    textureKey,
    resolvedFrame.frameWidth,
    resolvedFrame.frameHeight,
  );

  if (!spritesheetReady) {
    return null;
  }

  const resolvedTexture = scene.textures.get(textureKey);
  const playbackFacing = resolvePlaybackFacing(
    resolvedTexture,
    resolvedFrame.frameHeight,
    facing,
  );
  const frameMapping =
    sprite.animations[animationKey]?.[playbackFacing.facing] ??
    sprite.animations[animationKey]?.[CHARACTER_SPRITE_FACING.down];

  if (!frameMapping) {
    return null;
  }

  return {
    textureKey,
    animationKey,
    facing: playbackFacing.facing,
    flipX: playbackFacing.flipX,
  };
}

export function ensureCharacterAnimation(
  scene: Phaser.Scene,
  characterId: string,
  sprite: CharacterSpriteMetadata,
  playback: CharacterSpritePlaybackState,
): string | null {
  const phaserAnimationKey = buildCharacterAnimationKey(
    characterId,
    playback.textureKey,
    playback.animationKey,
    playback.facing,
  );

  if (scene.anims.exists(phaserAnimationKey)) {
    return phaserAnimationKey;
  }

  const texture = scene.textures.get(playback.textureKey);
  const resolvedFrame = resolveSpritesheetFrameDimensions(
    texture,
    sprite.frame.width,
    sprite.frame.height,
  );
  const frameMapping = sprite.animations[playback.animationKey]?.[playback.facing];

  if (!frameMapping) {
    return null;
  }

  const { start, end } = getRowFrameBounds(
    texture,
    resolvedFrame.frameWidth,
    frameMapping.row,
  );

  if (start > end) {
    return null;
  }

  scene.anims.create({
    key: phaserAnimationKey,
    frames: scene.anims.generateFrameNumbers(playback.textureKey, { start, end }),
    frameRate: frameMapping.frameRate,
    repeat: frameMapping.repeat,
  });

  return phaserAnimationKey;
}

export function applyCharacterSpritePlayback(
  bodySprite: Phaser.GameObjects.Sprite,
  scene: Phaser.Scene,
  characterId: string,
  sprite: CharacterSpriteMetadata,
  playback: CharacterSpritePlaybackState,
  displayScale: number,
): void {
  const phaserAnimationKey = ensureCharacterAnimation(scene, characterId, sprite, playback);

  bodySprite.setTexture(playback.textureKey);
  bodySprite.setScale(displayScale);
  bodySprite.setFlipX(playback.flipX);

  if (!phaserAnimationKey) {
    const texture = scene.textures.get(playback.textureKey);
    const resolvedFrame = resolveSpritesheetFrameDimensions(
      texture,
      sprite.frame.width,
      sprite.frame.height,
    );
    const frameMapping = sprite.animations[playback.animationKey]?.[playback.facing];
    const frameIndex = frameMapping
      ? resolveCharacterFrameIndex(
          texture,
          resolvedFrame.frameWidth,
          frameMapping.row,
          frameMapping.column,
        )
      : 0;

    bodySprite.anims.stop();
    bodySprite.setFrame(frameIndex);
    return;
  }

  if (!bodySprite.anims.isPlaying || bodySprite.anims.currentAnim?.key !== phaserAnimationKey) {
    bodySprite.play(phaserAnimationKey, true);
  }
}
