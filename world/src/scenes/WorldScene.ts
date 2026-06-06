import Phaser from "phaser";
import { characterDefinitions } from "../data/characters";
import { WorldInputController } from "../input/WorldInputController";
import { WorldRenderer } from "../rendering/world/WorldRenderer";
import { getWorldBounds } from "../rendering/world/getWorldBounds";
import { createWorld } from "../world/createWorld";
import { WorldRuntime } from "../world/WorldRuntime";

export class WorldScene extends Phaser.Scene {
  private worldRuntime: WorldRuntime | null = null;
  private worldRenderer: WorldRenderer | null = null;
  private inputController: WorldInputController | null = null;

  constructor() {
    super("world");
  }

  create(): void {
    const world = createWorld({
      definitions: characterDefinitions,
      bounds: getWorldBounds(this),
    });

    this.worldRuntime = new WorldRuntime(world);
    this.worldRenderer = new WorldRenderer(this);
    this.worldRenderer.create(this.worldRuntime.getState());
    this.inputController = new WorldInputController(this);
  }

  update(_time: number, delta: number): void {
    if (!this.inputController || !this.worldRuntime || !this.worldRenderer) {
      return;
    }

    const player = this.worldRuntime.getPlayer();

    if (player) {
      for (const action of this.inputController.readActions(player.id)) {
        this.worldRuntime.dispatch(action, "player");
      }
    }

    this.worldRuntime.step(delta);
    this.worldRenderer.render(this.worldRuntime.getState());
  }
}
