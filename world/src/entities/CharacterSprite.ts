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

export class CharacterSprite extends Phaser.GameObjects.Container {
  private readonly bodySprite: Phaser.GameObjects.Sprite;
  private readonly selectionRing: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
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

    this.label = scene.add
      .text(character.sprite.labelOffset.x, 0, character.name, {
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        color: character.appearance.labelColor,
      })
      .setOrigin(0.5, 0);
    this.label.setPosition(
      character.sprite.labelOffset.x,
      this.bodySprite.displayHeight / 2 + 8,
    );

    this.add([this.bodySprite, this.selectionRing, this.label]);
    scene.add.existing(this);
  }

  sync(character: CharacterState, isSelected = false): void {
    this.setPosition(character.position.x, character.position.y);
    this.applyBodyAnimation(character);
    const showSelectionRing =
      isSelected && character.characterKind !== CHARACTER_KINDS.player;

    this.selectionRing.setRadius(character.appearance.radius);
    this.selectionRing.setStrokeStyle(
      showSelectionRing ? SELECTION_STROKE_WIDTH : 0,
      SELECTION_STROKE_COLOR,
      showSelectionRing ? 1 : 0,
    );
    this.label.setPosition(
      character.sprite.labelOffset.x,
      this.bodySprite.displayHeight / 2 + 8,
    );
    this.label.setAlpha(isSelected ? 1 : 0.9);
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
