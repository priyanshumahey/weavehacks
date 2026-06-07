import Phaser from "phaser";
import { AgentOrchestrator } from "../agents/orchestrator/AgentOrchestrator";
import { createCharacterAgents } from "../agents/orchestrator/createCharacterAgents";
import { preloadWorldAssets } from "../assets/worldAssetRegistry";
import { characterDefinitions } from "../data/characters";
import { propDefinitions } from "../data/props";
import {
  collectCharacterTextureKeys,
  preloadCharacterSpritesheets,
} from "../rendering/characters/preloadCharacterSpritesheets";
import {
  collectPlayerAppearanceTextureKeys,
  preloadPlayerAppearances,
} from "../rendering/characters/preloadPlayerAppearances";
import { WorldInputController } from "../input/WorldInputController";
import { WorldRenderer } from "../rendering/world/WorldRenderer";
import { setupWorldCamera } from "../rendering/world/createWorldFrame";
import { getWorldBounds } from "../rendering/world/getWorldBounds";
import { createWorld } from "../world/createWorld";
import { WorldRuntime } from "../world/WorldRuntime";
import { WORLD_ACTION_TYPES } from "../world/worldActions";
import { CHARACTER_CONTROLLER_TYPES } from "../world/worldState";

export const SCENE_KEYS = {
  world: "world",
} as const;

export class WorldScene extends Phaser.Scene {
  private worldRuntime: WorldRuntime | null = null;
  private worldRenderer: WorldRenderer | null = null;
  private inputController: WorldInputController | null = null;
  private agentOrchestrator: AgentOrchestrator | null = null;
  private hasSetupCamera = false;

  constructor() {
    super(SCENE_KEYS.world);
  }

  preload(): void {
    preloadCharacterSpritesheets(this, characterDefinitions);
    preloadPlayerAppearances(this);

    const skipKeys = new Set([
      ...collectCharacterTextureKeys(characterDefinitions),
      ...collectPlayerAppearanceTextureKeys(),
    ]);
    preloadWorldAssets(this, skipKeys);
  }

  create(): void {
    const world = createWorld({
      definitions: characterDefinitions,
      propDefinitions,
      bounds: getWorldBounds(),
    });

    this.worldRuntime = new WorldRuntime(world);
    this.worldRenderer = new WorldRenderer(this);
    this.worldRenderer.setOnPlayerAppearanceSelect((appearanceId) => {
      const player = this.worldRuntime?.getPlayer();

      if (!player || !this.worldRuntime) {
        return;
      }

      this.worldRuntime.dispatch(
        {
          type: WORLD_ACTION_TYPES.setPlayerAppearance,
          entityId: player.id,
          appearanceId,
        },
        CHARACTER_CONTROLLER_TYPES.player,
      );
    });
    this.worldRenderer.create(this.worldRuntime.getState());
    this.inputController = new WorldInputController(this);
    this.agentOrchestrator = new AgentOrchestrator(createCharacterAgents(world.characters));
  }

  update(_time: number, delta: number): void {
    if (
      !this.inputController ||
      !this.worldRuntime ||
      !this.worldRenderer ||
      !this.agentOrchestrator
    ) {
      return;
    }

    const player = this.worldRuntime.getPlayer();

    if (player) {
      for (const action of this.inputController.readActions(player.id)) {
        this.worldRuntime.dispatch(action, CHARACTER_CONTROLLER_TYPES.player);
      }
    }

    this.agentOrchestrator.tick(this.worldRuntime);

    this.worldRuntime.step(delta);
    this.worldRenderer.render(this.worldRuntime.getState());
    this.ensureCameraFollow();
  }

  private ensureCameraFollow(): void {
    if (this.hasSetupCamera || !this.worldRuntime || !this.worldRenderer) {
      return;
    }

    const player = this.worldRuntime.getPlayer();

    if (!player) {
      return;
    }

    const playerSprite = this.worldRenderer.getCharacterSprite(player.id);

    if (!playerSprite) {
      return;
    }

    setupWorldCamera(this, playerSprite);
    this.hasSetupCamera = true;
  }
}
