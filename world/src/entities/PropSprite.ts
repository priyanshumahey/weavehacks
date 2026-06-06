import Phaser from "phaser";
import type { PropState } from "../world/worldState";

const PROP_BASE_DEPTH = 1;

export class PropSprite extends Phaser.GameObjects.Container {
  private readonly bodySprite: Phaser.GameObjects.Sprite;
  readonly propId: string;

  constructor(scene: Phaser.Scene, prop: PropState) {
    super(scene, prop.position.x, prop.position.y);

    this.propId = prop.id;

    const textureKey = prop.sprite.textureKey;
    const hasTexture = scene.textures.exists(textureKey);

    this.bodySprite = scene.add.sprite(0, 0, hasTexture ? textureKey : "__MISSING");
    this.applySpritePresentation(prop);
    this.setDepth(PROP_BASE_DEPTH + prop.position.y);

    this.add(this.bodySprite);
    scene.add.existing(this);
  }

  sync(prop: PropState): void {
    this.setPosition(prop.position.x, prop.position.y);
    this.setDepth(PROP_BASE_DEPTH + prop.position.y);
    this.applySpritePresentation(prop);
  }

  private applySpritePresentation(prop: PropState): void {
    const { sprite } = prop;
    const textureKey = sprite.textureKey;

    this.bodySprite.setOrigin(sprite.origin.x, sprite.origin.y);

    if (!this.scene.textures.exists(textureKey)) {
      this.bodySprite.setTexture("__MISSING");
      this.bodySprite.setFrame(0);
      this.bodySprite.setScale(sprite.scale);
      return;
    }

    this.bodySprite.setTexture(textureKey);
    this.bodySprite.setScale(sprite.scale);
  }
}
