import Phaser from "phaser";
import type { CharacterAgent } from "../agents/characterAgent";
import { ScoutGreeterAgent } from "../agents/ScoutGreeterAgent";
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
  private agents: CharacterAgent[] = [];

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
    this.agents = world.characters.scout ? [new ScoutGreeterAgent("scout")] : [];
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

    for (const agent of this.agents) {
      const observation = this.worldRuntime.getObservation(agent.characterId);

      if (!observation) {
        continue;
      }

      for (const action of agent.decide(observation)) {
        this.worldRuntime.dispatch(action, "agent");
      }
    }

    this.worldRuntime.step(delta);
    this.worldRenderer.render(this.worldRuntime.getState());
  }
}
