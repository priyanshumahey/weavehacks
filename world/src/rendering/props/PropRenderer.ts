import type Phaser from "phaser";
import { PropSprite } from "../../entities/PropSprite";
import { isPropState, type WorldState } from "../../world/worldState";

export class PropRenderer {
  private readonly sprites = new Map<string, PropSprite>();

  constructor(private readonly scene: Phaser.Scene) {}

  render(state: WorldState): void {
    const activePropIds = new Set(
      Object.values(state.entities)
        .filter(isPropState)
        .map((entity) => entity.id),
    );

    for (const [propId, sprite] of this.sprites) {
      if (activePropIds.has(propId)) {
        continue;
      }

      sprite.destroy();
      this.sprites.delete(propId);
    }

    for (const entity of Object.values(state.entities)) {
      if (!isPropState(entity)) {
        continue;
      }

      let sprite = this.sprites.get(entity.id);

      if (!sprite) {
        sprite = new PropSprite(this.scene, entity);
        this.sprites.set(entity.id, sprite);
      }

      sprite.sync(entity);
    }
  }
}
