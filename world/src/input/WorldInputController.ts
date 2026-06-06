import Phaser from "phaser";
import type { WorldAction } from "../world/worldActions";

export class WorldInputController {
  private readonly cursors: Phaser.Types.Input.Keyboard.CursorKeys | null;
  private readonly interactKey: Phaser.Input.Keyboard.Key | null;
  private wasInteractPressed = false;

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
        type: "move",
        entityId,
        intent: { x, y },
      },
    ];

    const isInteractPressed =
      (this.interactKey?.isDown ?? false) || (this.cursors?.space?.isDown ?? false);

    if (isInteractPressed && !this.wasInteractPressed) {
      actions.push({
        type: "interact",
        entityId,
      });
    }

    this.wasInteractPressed = isInteractPressed;

    return actions;
  }
}
