import Phaser from "phaser";
import { characterDefinitions } from "../data/characters";
import { WorldInputController } from "../input/WorldInputController";
import { CharacterRenderer } from "../rendering/characters/CharacterRenderer";
import { createWorldFrame } from "../rendering/world/createWorldFrame";
import { createWorld } from "../world/createWorld";
import { WorldRuntime } from "../world/WorldRuntime";

export class WorldScene extends Phaser.Scene {
  private worldRuntime: WorldRuntime | null = null;
  private characterRenderer: CharacterRenderer | null = null;
  private inputController: WorldInputController | null = null;

  constructor() {
    super("world");
  }

  create(): void {
    const frame = createWorldFrame(this);

    const world = createWorld({
      definitions: characterDefinitions,
      bounds: frame.bounds,
    });

    this.worldRuntime = new WorldRuntime(world);
    this.characterRenderer = new CharacterRenderer(this, this.worldRuntime);
    this.characterRenderer.create();
    this.inputController = new WorldInputController(this);
  }

  update(_time: number, delta: number): void {
    if (!this.inputController || !this.worldRuntime || !this.characterRenderer) {
      return;
    }

    const player = this.worldRuntime.getPlayer();
    const intent = this.inputController.readMovementIntent();

    if (player) {
      this.worldRuntime.dispatch({
        type: "move",
        entityId: player.id,
        intent: intent ?? { x: 0, y: 0 },
      });
    }

    this.worldRuntime.step(delta);
    this.characterRenderer.render();
  }
}
