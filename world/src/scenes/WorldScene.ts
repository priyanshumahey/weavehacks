import Phaser from "phaser";
import type { CharacterAgent } from "../agents/characterAgent";
import { ScoutGreeterAgent } from "../agents/ScoutGreeterAgent";
import { preloadWorldAssets } from "../assets/worldAssetRegistry";
import { characterDefinitions } from "../data/characters";
import { propDefinitions } from "../data/props";
import {
  collectCharacterTextureKeys,
  preloadCharacterSpritesheets,
} from "../rendering/characters/preloadCharacterSpritesheets";
import { WorldInputController } from "../input/WorldInputController";
import { WorldRenderer } from "../rendering/world/WorldRenderer";
import { getWorldBounds } from "../rendering/world/getWorldBounds";
import { createWorld } from "../world/createWorld";
import { WorldRuntime } from "../world/WorldRuntime";
import { CHARACTER_CONTROLLER_TYPES } from "../world/worldState";

export const SCENE_KEYS = {
  world: "world",
} as const;

export class WorldScene extends Phaser.Scene {
  private worldRuntime: WorldRuntime | null = null;
  private worldRenderer: WorldRenderer | null = null;
  private inputController: WorldInputController | null = null;
  private agents: CharacterAgent[] = [];

  constructor() {
    super(SCENE_KEYS.world);
  }

  preload(): void {
    preloadCharacterSpritesheets(this, characterDefinitions);
    preloadWorldAssets(this, collectCharacterTextureKeys(characterDefinitions));
  }

  create(): void {
    const world = createWorld({
      definitions: characterDefinitions,
      propDefinitions,
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
        this.worldRuntime.dispatch(action, CHARACTER_CONTROLLER_TYPES.player);
      }
    }

    for (const agent of this.agents) {
      const observation = this.worldRuntime.getObservation(agent.characterId);

      if (!observation) {
        continue;
      }

      for (const action of agent.decide(observation)) {
        this.worldRuntime.dispatch(action, CHARACTER_CONTROLLER_TYPES.agent);
      }
    }

    this.worldRuntime.step(delta);
    this.worldRenderer.render(this.worldRuntime.getState());
  }
}
