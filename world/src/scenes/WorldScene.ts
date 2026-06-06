import Phaser from "phaser";
import { characterDefinitions } from "../data/characters";
import { WorldInputController } from "../input/WorldInputController";
import { CharacterRenderer } from "../rendering/characters/CharacterRenderer";
import { createWorldFrame } from "../rendering/world/createWorldFrame";
import { CharacterManager } from "../runtime/characters/CharacterManager";

export class WorldScene extends Phaser.Scene {
  private characterManager: CharacterManager | null = null;
  private characterRenderer: CharacterRenderer | null = null;
  private inputController: WorldInputController | null = null;

  constructor() {
    super("world");
  }

  create(): void {
    const frame = createWorldFrame(this);

    this.characterManager = new CharacterManager({
      definitions: characterDefinitions,
      bounds: frame.bounds,
    });
    this.characterRenderer = new CharacterRenderer(this, this.characterManager);
    this.characterRenderer.create();
    this.inputController = new WorldInputController(this);
  }

  update(_time: number, delta: number): void {
    if (!this.inputController || !this.characterManager || !this.characterRenderer) {
      return;
    }

    const player = this.characterManager.getPlayer();
    const intent = this.inputController.readMovementIntent();

    if (player && intent) {
      const speed = (player.movement.speed * delta) / 1000;
      this.characterManager.moveCharacter(
        player.id,
        intent.x * speed,
        intent.y * speed,
      );
    }

    this.characterRenderer.render();
  }
}
