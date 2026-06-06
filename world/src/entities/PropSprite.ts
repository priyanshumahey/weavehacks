import Phaser from "phaser";
import {
  RENDER_DEPTH_PRIORITY,
  resolvePropSortY,
  resolveTextureDisplayHeight,
  resolveWorldRenderDepth,
} from "../rendering/renderDepth";
import type { PropState } from "../world/worldState";

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
    this.applyRenderDepth(prop);

    this.add(this.bodySprite);
    scene.add.existing(this);
  }

  sync(prop: PropState): void {
    this.setPosition(prop.position.x, prop.position.y);
    this.applySpritePresentation(prop);
    this.applyRenderDepth(prop);
  }

  private applyRenderDepth(prop: PropState): void {
    const displayHeight = this.resolveDisplayHeight(prop);
    const sortY = resolvePropSortY(
      prop.position.y,
      displayHeight,
      prop.sprite.origin.y,
    );

    this.setDepth(
      resolveWorldRenderDepth(sortY, RENDER_DEPTH_PRIORITY.prop),
    );
  }

  private resolveDisplayHeight(prop: PropState): number {
    const { textureKey, scale } = prop.sprite;

    if (!this.scene.textures.exists(textureKey)) {
      return 0;
    }

    const texture = this.scene.textures.get(textureKey);
    return resolveTextureDisplayHeight(texture.source[0].height, scale);
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
