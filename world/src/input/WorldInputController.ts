import Phaser from "phaser";
import { WORLD_ACTION_TYPES, type WorldAction } from "../world/worldActions";

export class WorldInputController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | null;
  private readonly interactKey: Phaser.Input.Keyboard.Key | null;

  constructor(scene: Phaser.Scene) {
    this.cursors = scene.input.keyboard?.createCursorKeys() ?? null;
    this.interactKey =
      scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E) ?? null;
  }

  readActions(entityId: string): WorldAction[] {
    let x = 0;
    let y = 0;

    if (this.cursors?.left.isDown) {
      x -= 1;
    }

    if (this.cursors?.right.isDown) {
      x += 1;
    }

    if (this.cursors?.up.isDown) {
      y -= 1;
    }

    if (this.cursors?.down.isDown) {
      y += 1;
    }

    const actions: WorldAction[] = [
      {
        type: WORLD_ACTION_TYPES.move,
        entityId,
        intent: { x, y },
      },
    ];

    const interactJustPressed =
      (this.interactKey && Phaser.Input.Keyboard.JustDown(this.interactKey)) ||
      (this.cursors?.space && Phaser.Input.Keyboard.JustDown(this.cursors.space));

    if (interactJustPressed) {
      actions.push({
        type: WORLD_ACTION_TYPES.interact,
        entityId,
      });
    }

    return actions;
  }
}
