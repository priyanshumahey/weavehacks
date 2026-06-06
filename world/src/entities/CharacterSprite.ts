import Phaser from "phaser";
import {
  applyCharacterSpritePlayback,
  resolveCharacterSpritePlayback,
} from "../rendering/characters/characterSpriteAnimations";
import {
  ensureCharacterSpritesheet,
  resolveCharacterDisplayScale,
  resolveSpritesheetFrameDimensions,
} from "../rendering/characters/characterSpritesheet";
import {
  isCharacterMoving,
  resolveCharacterFacing,
} from "../rendering/characters/resolveCharacterFacing";
import {
  CHARACTER_SPRITE_ANIMATION_KEYS,
  CHARACTER_SPRITE_FACING,
  type CharacterSpriteFacing,
} from "../types/characterSprite";
import { CHARACTER_KINDS, type CharacterState } from "../world/worldState";

const SELECTION_STROKE_COLOR = 0xf6bd60;
const SELECTION_STROKE_WIDTH = 3;

export class CharacterSprite extends Phaser.GameObjects.Container {
  private readonly bodySprite: Phaser.GameObjects.Sprite;
  private readonly selectionRing: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private lastFacing: CharacterSpriteFacing = CHARACTER_SPRITE_FACING.down;
  readonly characterId: string;

  constructor(scene: Phaser.Scene, character: CharacterState) {
    super(scene, character.position.x, character.position.y);

    this.characterId = character.id;

    const { textureKey } = character.sprite;
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
    const { textureKey, frame, scale } = character.sprite;
    const animationKey = isCharacterMoving(character.moveIntent)
      ? CHARACTER_SPRITE_ANIMATION_KEYS.walk
      : CHARACTER_SPRITE_ANIMATION_KEYS.idle;

    this.lastFacing = resolveCharacterFacing(character.moveIntent, this.lastFacing);

    if (!this.scene.textures.exists(textureKey)) {
      this.bodySprite.setTexture("__MISSING");
      this.bodySprite.setFrame(0);
      this.bodySprite.setScale(scale);
      this.bodySprite.anims.stop();
      return;
    }

    const playback = resolveCharacterSpritePlayback(
      character.sprite,
      animationKey,
      this.lastFacing,
      this.scene,
    );

    if (!playback) {
      this.bodySprite.setTexture(textureKey);
      this.bodySprite.setScale(scale);
      this.bodySprite.anims.stop();
      return;
    }

    const texture = this.scene.textures.get(playback.textureKey);
    const resolvedFrame = resolveSpritesheetFrameDimensions(texture, frame.width, frame.height);
    ensureCharacterSpritesheet(
      this.scene,
      playback.textureKey,
      resolvedFrame.frameWidth,
      resolvedFrame.frameHeight,
    );
    const displayScale = resolveCharacterDisplayScale(
      resolvedFrame.frameHeight,
      character.appearance.radius,
      scale,
    );

    applyCharacterSpritePlayback(
      this.bodySprite,
      this.scene,
      character.id,
      character.sprite,
      playback,
      displayScale,
    );
  }
}
