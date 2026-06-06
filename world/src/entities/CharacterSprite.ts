import Phaser from "phaser";
import {
  CHARSET_IDLE_FRAME_INDEX,
  resolveCharsetFrameTextureKey,
} from "../rendering/characters/charsetFrames";
import {
  resolveCharacterDisplayScale,
  resolveCharacterFrameIndex,
  resolveCharacterSlotTopOffset,
  resolveSpritesheetFrameDimensions,
} from "../rendering/characters/characterSpritesheet";
import {
  RENDER_DEPTH_PRIORITY,
  resolveCharacterSortY,
  resolveWorldRenderDepth,
} from "../rendering/renderDepth";
import {
  CHARACTER_SPRITE_FACING,
  type CharacterSpriteAnimationFrameRange,
  type CharacterSpriteAnimationKey,
  type CharacterSpriteFacing,
  type CharacterSpriteMetadata,
} from "../types/characterSprite";
import { CHARACTER_KINDS, type CharacterState } from "../world/worldState";

const SELECTION_STROKE_COLOR = 0xf6bd60;
const SELECTION_STROKE_WIDTH = 3;
const SIDE_VIEW_CANONICAL_FACING = CHARACTER_SPRITE_FACING.down;

const LABEL_FONT_FAMILY = "Arial, sans-serif";
const LABEL_FONT_SIZE = "11px";
const LABEL_TEXT_COLOR = "#ffffff";
const LABEL_BACKGROUND_COLOR = 0x000000;
const LABEL_BACKGROUND_ALPHA = 0.88;
const LABEL_PADDING_X = 8;
const LABEL_PADDING_Y = 4;
const LABEL_BORDER_RADIUS = 4;
const LABEL_GAP_ABOVE_SPRITE = 10;

interface AppliedBodyPresentation {
  textureKey: string;
  displayScale: number;
  flipX: boolean;
  presentationKey: string;
}

export class CharacterSprite extends Phaser.GameObjects.Container {
  private readonly bodySprite: Phaser.GameObjects.Sprite;
  private readonly selectionRing: Phaser.GameObjects.Arc;
  private readonly labelBadge: Phaser.GameObjects.Container;
  private readonly labelBackground: Phaser.GameObjects.Graphics;
  private readonly labelText: Phaser.GameObjects.Text;
  private appliedBodyPresentation: AppliedBodyPresentation | null = null;
  readonly characterId: string;

  constructor(scene: Phaser.Scene, character: CharacterState) {
    super(scene, character.position.x, character.position.y);

    this.characterId = character.id;

    const textureKey = this.resolveTextureKey(character.sprite, character.animation);
    const hasTexture = scene.textures.exists(textureKey);

    this.bodySprite = scene.add.sprite(0, 0, hasTexture ? textureKey : "__MISSING");
    this.bodySprite.setOrigin(character.sprite.origin.x, character.sprite.origin.y);
    this.applyBodyAnimation(character);

    this.selectionRing = scene.add.circle(
      0,
      0,
      character.appearance.radius,
      0x000000,
      0,
    );

    this.labelText = scene.add
      .text(0, 0, character.name, {
        fontFamily: LABEL_FONT_FAMILY,
        fontSize: LABEL_FONT_SIZE,
        color: LABEL_TEXT_COLOR,
      })
      .setOrigin(0.5, 0.5);
    this.labelBackground = scene.add.graphics();
    this.labelBadge = scene.add.container(0, 0, [
      this.labelBackground,
      this.labelText,
    ]);
    this.redrawLabelBadge();
    this.updateLabelPosition(character);

    this.add([this.bodySprite, this.selectionRing, this.labelBadge]);
    scene.add.existing(this);
  }

  sync(character: CharacterState, isSelected = false): void {
    this.setPosition(character.position.x, character.position.y);
    this.applyBodyAnimation(character);
    this.applyRenderDepth(character);
    const showSelectionRing =
      isSelected && character.characterKind !== CHARACTER_KINDS.player;

    this.selectionRing.setRadius(character.appearance.radius);
    this.selectionRing.setStrokeStyle(
      showSelectionRing ? SELECTION_STROKE_WIDTH : 0,
      SELECTION_STROKE_COLOR,
      showSelectionRing ? 1 : 0,
    );
    this.updateLabelPosition(character);
    this.labelBadge.setAlpha(isSelected ? 1 : 0.92);
  }

  private applyRenderDepth(character: CharacterState): void {
    const displayHeight = character.sprite.displayHeight;
    const sortY = resolveCharacterSortY(
      character.position.y,
      displayHeight,
      character.sprite.origin.y,
    );

    this.setDepth(
      resolveWorldRenderDepth(sortY, RENDER_DEPTH_PRIORITY.character),
    );
  }

  private updateLabelPosition(character: CharacterState): void {
    const badgeHeight = this.labelText.height + LABEL_PADDING_Y * 2;
    const slotTopOffset = resolveCharacterSlotTopOffset(
      character.sprite.displayHeight,
      character.sprite.origin.y,
    );

    this.labelBadge.setPosition(
      character.sprite.labelOffset.x,
      -slotTopOffset - LABEL_GAP_ABOVE_SPRITE - badgeHeight / 2,
    );
  }

  private redrawLabelBadge(): void {
    const badgeWidth = this.labelText.width + LABEL_PADDING_X * 2;
    const badgeHeight = this.labelText.height + LABEL_PADDING_Y * 2;

    this.labelBackground.clear();
    this.labelBackground.fillStyle(LABEL_BACKGROUND_COLOR, LABEL_BACKGROUND_ALPHA);
    this.labelBackground.fillRoundedRect(
      -badgeWidth / 2,
      -badgeHeight / 2,
      badgeWidth,
      badgeHeight,
      LABEL_BORDER_RADIUS,
    );
  }

  private applyBodyAnimation(character: CharacterState): void {
    const { sprite } = character;

    this.bodySprite.setOrigin(sprite.origin.x, sprite.origin.y);

    if (sprite.frameSourcePath) {
      this.applyCharsetFrameAnimation(character);
      return;
    }

    this.applySpritesheetAnimation(character);
  }

  private applyCharsetFrameAnimation(character: CharacterState): void {
    const { sprite, animation, facing } = character;
    const frameSourcePath = sprite.frameSourcePath;

    if (!frameSourcePath) {
      return;
    }

    const frameMapping =
      sprite.animations[animation]?.[facing] ??
      sprite.animations[animation]?.[CHARACTER_SPRITE_FACING.down];

    if (!frameMapping) {
      const fallbackTextureKey = resolveCharsetFrameTextureKey(
        frameSourcePath,
        CHARACTER_SPRITE_FACING.down,
        CHARSET_IDLE_FRAME_INDEX,
      );

      if (!this.scene.textures.exists(fallbackTextureKey)) {
        this.applyMissingBodyPresentation(sprite.displayHeight);
        return;
      }

      this.applyStaticBodyPresentation({
        textureKey: fallbackTextureKey,
        displayScale: this.resolveCharsetDisplayScale(
          fallbackTextureKey,
          sprite.displayHeight,
        ),
        flipX: false,
        frameIndex: 0,
      });
      return;
    }

    if (frameMapping.frameIndex != null) {
      const textureKey = resolveCharsetFrameTextureKey(
        frameSourcePath,
        facing,
        frameMapping.frameIndex,
      );

      if (!this.scene.textures.exists(textureKey)) {
        this.applyMissingBodyPresentation(sprite.displayHeight);
        return;
      }

      this.applyStaticBodyPresentation({
        textureKey,
        displayScale: this.resolveCharsetDisplayScale(textureKey, sprite.displayHeight),
        flipX: false,
        frameIndex: 0,
      });
      return;
    }

    const phaserAnimationKey = this.ensureCharsetFrameAnimation(
      character.id,
      frameSourcePath,
      animation,
      facing,
      frameMapping,
    );

    if (!phaserAnimationKey) {
      this.applyMissingBodyPresentation(sprite.displayHeight);
      return;
    }

    const startFrame = frameMapping.startFrame ?? 0;
    const startTextureKey = resolveCharsetFrameTextureKey(
      frameSourcePath,
      facing,
      startFrame,
    );

    this.applyAnimatedBodyPresentation({
      textureKey: startTextureKey,
      displayScale: this.resolveCharsetDisplayScale(startTextureKey, sprite.displayHeight),
      flipX: false,
      phaserAnimationKey,
    });
  }

  private applySpritesheetAnimation(character: CharacterState): void {
    const { sprite, animation, facing } = character;
    const textureKey = this.resolveTextureKey(sprite, animation);

    if (!this.scene.textures.exists(textureKey)) {
      this.applyMissingBodyPresentation(sprite.displayHeight);
      return;
    }

    const texture = this.scene.textures.get(textureKey);
    const resolvedFrame = resolveSpritesheetFrameDimensions(
      texture,
      sprite.frame.width,
      sprite.frame.height,
    );

    const spritesheet = texture;
    const presentation = this.resolvePresentationFacing(
      spritesheet,
      resolvedFrame.frameHeight,
      facing,
    );
    const frameMapping =
      sprite.animations[animation]?.[presentation.facing] ??
      sprite.animations[animation]?.[CHARACTER_SPRITE_FACING.down];

    const displayScale = resolveCharacterDisplayScale(
      resolvedFrame.frameHeight,
      sprite.displayHeight,
    );

    if (!frameMapping) {
      this.applyStaticBodyPresentation({
        textureKey,
        displayScale,
        flipX: presentation.flipX,
        frameIndex: 0,
      });
      return;
    }

    const phaserAnimationKey = this.ensurePhaserAnimation(
      character.id,
      sprite,
      textureKey,
      animation,
      presentation.facing,
      resolvedFrame.frameWidth,
      frameMapping,
    );

    if (phaserAnimationKey) {
      this.applyAnimatedBodyPresentation({
        textureKey,
        displayScale,
        flipX: presentation.flipX,
        phaserAnimationKey,
      });
      return;
    }

    this.applyStaticBodyPresentation({
      textureKey,
      displayScale,
      flipX: presentation.flipX,
      frameIndex: resolveCharacterFrameIndex(
        spritesheet,
        resolvedFrame.frameWidth,
        frameMapping.row ?? 0,
        frameMapping.column ?? 0,
      ),
    });
  }

  private applyMissingBodyPresentation(displayHeight: number): void {
    const presentationKey = "missing:0";
    const displayScale = displayHeight;

    if (
      this.appliedBodyPresentation?.textureKey === "__MISSING" &&
      this.appliedBodyPresentation.displayScale === displayScale &&
      this.appliedBodyPresentation.flipX === false &&
      this.appliedBodyPresentation.presentationKey === presentationKey
    ) {
      return;
    }

    this.bodySprite.setTexture("__MISSING");
    this.bodySprite.setFrame(0);
    this.bodySprite.setScale(displayScale);
    this.bodySprite.anims.stop();
    this.appliedBodyPresentation = {
      textureKey: "__MISSING",
      displayScale,
      flipX: false,
      presentationKey,
    };
  }

  private applyAnimatedBodyPresentation(presentation: {
    textureKey: string;
    displayScale: number;
    flipX: boolean;
    phaserAnimationKey: string;
  }): void {
    if (this.isBodyPresentationApplied(presentation, presentation.phaserAnimationKey)) {
      return;
    }

    if (this.appliedBodyPresentation?.textureKey !== presentation.textureKey) {
      this.bodySprite.setTexture(presentation.textureKey);
    }

    if (this.appliedBodyPresentation?.displayScale !== presentation.displayScale) {
      this.bodySprite.setScale(presentation.displayScale);
    }

    if (this.appliedBodyPresentation?.flipX !== presentation.flipX) {
      this.bodySprite.setFlipX(presentation.flipX);
    }

    if (this.appliedBodyPresentation?.presentationKey !== presentation.phaserAnimationKey) {
      this.bodySprite.play(presentation.phaserAnimationKey);
    }

    this.appliedBodyPresentation = {
      textureKey: presentation.textureKey,
      displayScale: presentation.displayScale,
      flipX: presentation.flipX,
      presentationKey: presentation.phaserAnimationKey,
    };
  }

  private applyStaticBodyPresentation(presentation: {
    textureKey: string;
    displayScale: number;
    flipX: boolean;
    frameIndex: number;
  }): void {
    const presentationKey = `static:${presentation.frameIndex}`;

    if (this.isBodyPresentationApplied(presentation, presentationKey)) {
      return;
    }

    if (this.appliedBodyPresentation?.textureKey !== presentation.textureKey) {
      this.bodySprite.setTexture(presentation.textureKey);
    }

    if (this.appliedBodyPresentation?.displayScale !== presentation.displayScale) {
      this.bodySprite.setScale(presentation.displayScale);
    }

    if (this.appliedBodyPresentation?.flipX !== presentation.flipX) {
      this.bodySprite.setFlipX(presentation.flipX);
    }

    if (this.appliedBodyPresentation?.presentationKey !== presentationKey) {
      this.bodySprite.anims.stop();
      this.bodySprite.setFrame(presentation.frameIndex, false, false);
    }

    this.appliedBodyPresentation = {
      textureKey: presentation.textureKey,
      displayScale: presentation.displayScale,
      flipX: presentation.flipX,
      presentationKey,
    };
  }

  private isBodyPresentationApplied(
    presentation: {
      textureKey: string;
      displayScale: number;
      flipX: boolean;
    },
    presentationKey: string,
  ): boolean {
    return (
      this.appliedBodyPresentation?.textureKey === presentation.textureKey &&
      this.appliedBodyPresentation.displayScale === presentation.displayScale &&
      this.appliedBodyPresentation.flipX === presentation.flipX &&
      this.appliedBodyPresentation.presentationKey === presentationKey
    );
  }

  private resolveTextureKey(
    sprite: CharacterSpriteMetadata,
    animationKey: CharacterSpriteAnimationKey,
  ): string {
    return sprite.animationTextureKeys?.[animationKey] ?? sprite.textureKey;
  }

  private resolvePresentationFacing(
    texture: Phaser.Textures.Texture,
    frameHeight: number,
    facing: CharacterSpriteFacing,
  ): { facing: CharacterSpriteFacing; flipX: boolean } {
    if (texture.source[0].height > frameHeight) {
      return { facing, flipX: false };
    }

    return {
      facing: SIDE_VIEW_CANONICAL_FACING,
      flipX: facing === CHARACTER_SPRITE_FACING.left,
    };
  }

  private buildPhaserAnimationKey(
    characterId: string,
    textureKey: string,
    animationKey: CharacterSpriteAnimationKey,
    facing: CharacterSpriteFacing,
  ): string {
    return `${characterId}:${textureKey}:${animationKey}:${facing}`;
  }

  private ensurePhaserAnimation(
    characterId: string,
    sprite: CharacterSpriteMetadata,
    textureKey: string,
    animationKey: CharacterSpriteAnimationKey,
    facing: CharacterSpriteFacing,
    frameWidth: number,
    frameMapping: NonNullable<
      CharacterSpriteMetadata["animations"][CharacterSpriteAnimationKey]
    >[CharacterSpriteFacing],
  ): string | null {
    const phaserAnimationKey = this.buildPhaserAnimationKey(
      characterId,
      textureKey,
      animationKey,
      facing,
    );

    if (this.scene.anims.exists(phaserAnimationKey)) {
      return phaserAnimationKey;
    }

    const texture = this.scene.textures.get(textureKey);
    const columnsPerRow = Math.max(1, Math.floor(texture.source[0].width / frameWidth));
    const start = (frameMapping.row ?? 0) * columnsPerRow + (frameMapping.column ?? 0);
    const columnSpan = frameMapping.columnSpan ?? columnsPerRow;
    const end = Math.min(start + columnSpan - 1, texture.frameTotal - 1);

    if (start > end) {
      return null;
    }

    this.scene.anims.create({
      key: phaserAnimationKey,
      frames: this.scene.anims.generateFrameNumbers(textureKey, { start, end }),
      frameRate: frameMapping.frameRate,
      repeat: frameMapping.repeat,
    });

    return phaserAnimationKey;
  }

  private resolveCharsetDisplayScale(textureKey: string, displayHeight: number): number {
    const texture = this.scene.textures.get(textureKey);
    const frameHeight = texture.get().height;

    return resolveCharacterDisplayScale(frameHeight, displayHeight);
  }

  private buildCharsetFrameAnimationKey(
    characterId: string,
    frameSourcePath: string,
    animationKey: CharacterSpriteAnimationKey,
    facing: CharacterSpriteFacing,
  ): string {
    return `${characterId}:charset:${frameSourcePath}:${animationKey}:${facing}`;
  }

  private ensureCharsetFrameAnimation(
    characterId: string,
    frameSourcePath: string,
    animationKey: CharacterSpriteAnimationKey,
    facing: CharacterSpriteFacing,
    frameMapping: CharacterSpriteAnimationFrameRange,
  ): string | null {
    const phaserAnimationKey = this.buildCharsetFrameAnimationKey(
      characterId,
      frameSourcePath,
      animationKey,
      facing,
    );

    if (this.scene.anims.exists(phaserAnimationKey)) {
      return phaserAnimationKey;
    }

    const startFrame = frameMapping.startFrame ?? 0;
    const endFrame = frameMapping.endFrame ?? startFrame;
    const frames: Phaser.Types.Animations.AnimationFrame[] = [];

    for (let frameIndex = startFrame; frameIndex <= endFrame; frameIndex += 1) {
      const textureKey = resolveCharsetFrameTextureKey(
        frameSourcePath,
        facing,
        frameIndex,
      );

      if (!this.scene.textures.exists(textureKey)) {
        continue;
      }

      frames.push({ key: textureKey, frame: 0 });
    }

    if (frames.length === 0) {
      return null;
    }

    this.scene.anims.create({
      key: phaserAnimationKey,
      frames,
      frameRate: frameMapping.frameRate,
      repeat: frameMapping.repeat,
    });

    return phaserAnimationKey;
  }
}
