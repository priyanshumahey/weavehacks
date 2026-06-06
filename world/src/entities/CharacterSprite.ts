import Phaser from "phaser";
import {
  resolveCharacterDisplayScale,
  resolveCharacterFrameIndex,
  resolveSpritesheetFrameDimensions,
} from "../rendering/characters/characterSpritesheet";
import {
  CHARACTER_SPRITE_FACING,
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

export class CharacterSprite extends Phaser.GameObjects.Container {
  private readonly bodySprite: Phaser.GameObjects.Sprite;
  private readonly selectionRing: Phaser.GameObjects.Arc;
  private readonly labelBadge: Phaser.GameObjects.Container;
  private readonly labelBackground: Phaser.GameObjects.Graphics;
  private readonly labelText: Phaser.GameObjects.Text;
  readonly characterId: string;

  constructor(scene: Phaser.Scene, character: CharacterState) {
    super(scene, character.position.x, character.position.y);

    this.characterId = character.id;

    const textureKey = this.resolveTextureKey(character.sprite, character.animation);
    const hasTexture = scene.textures.exists(textureKey);

    this.bodySprite = scene.add.sprite(0, 0, hasTexture ? textureKey : "__MISSING");
    this.bodySprite.setOrigin(0.5, 0.5);
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
    this.setDepth(character.position.y + 0.5);
    this.applyBodyAnimation(character);
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

  private updateLabelPosition(character: CharacterState): void {
    const badgeHeight = this.labelText.height + LABEL_PADDING_Y * 2;
    const spriteTop = character.appearance.radius;

    this.labelBadge.setPosition(
      character.sprite.labelOffset.x,
      -spriteTop - LABEL_GAP_ABOVE_SPRITE - badgeHeight / 2,
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
    const { sprite, animation, facing } = character;
    const textureKey = this.resolveTextureKey(sprite, animation);

    if (!this.scene.textures.exists(textureKey)) {
      this.bodySprite.setTexture("__MISSING");
      this.bodySprite.setFrame(0);
      this.bodySprite.setScale(sprite.scale);
      this.bodySprite.anims.stop();
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
      character.appearance.radius,
      sprite.scale,
    );

    this.bodySprite.setTexture(textureKey);
    this.bodySprite.setScale(displayScale);
    this.bodySprite.setFlipX(presentation.flipX);

    if (!frameMapping) {
      this.bodySprite.anims.stop();
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
      this.bodySprite.play(phaserAnimationKey, true);
      return;
    }

    this.bodySprite.anims.stop();
    this.bodySprite.setFrame(
      resolveCharacterFrameIndex(
        spritesheet,
        resolvedFrame.frameWidth,
        frameMapping.row,
        frameMapping.column,
      ),
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
    const start = frameMapping.row * columnsPerRow + frameMapping.column;
    const end = Math.min(start + columnsPerRow - 1, texture.frameTotal - 1);

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
}
