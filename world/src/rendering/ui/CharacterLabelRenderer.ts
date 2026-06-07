import Phaser from "phaser";
import {
  RENDER_DEPTH_PRIORITY,
  resolveCharacterSortY,
  resolveWorldRenderDepth,
} from "../renderDepth";
import type { WorldState } from "../../world/worldState";
import {
  type CharacterLabelPlacement,
  resolveCharacterLabelWorldPosition,
} from "./resolveCharacterLabelWorldPosition";

const LABEL_DEPTH_OFFSET = 0.0002;
const UNSELECTED_LABEL_ALPHA = 0.92;

interface CharacterLabelElement {
  label: Phaser.GameObjects.DOMElement;
}

export interface CharacterLabelRendererOptions {
  placement?: CharacterLabelPlacement;
}

export class CharacterLabelRenderer {
  private readonly labels = new Map<string, CharacterLabelElement>();
  private readonly placement: CharacterLabelPlacement;
  private readonly originY: number;
  private readonly placementClass: string;

  constructor(
    private readonly scene: Phaser.Scene,
    options: CharacterLabelRendererOptions = {},
  ) {
    this.placement = options.placement ?? "above";
    this.originY = this.placement === "below" ? 0 : 1;
    this.placementClass =
      this.placement === "below"
        ? "world-character-label--below"
        : "world-character-label--above";
  }

  render(state: WorldState): void {
    const activeCharacterIds = new Set(Object.keys(state.characters));
    const camera = this.scene.cameras.main;
    const worldView = camera.worldView;

    for (const [characterId, entry] of this.labels) {
      if (activeCharacterIds.has(characterId)) {
        continue;
      }

      entry.label.destroy();
      this.labels.delete(characterId);
    }

    for (const character of Object.values(state.characters)) {
      let entry = this.labels.get(character.id);

      if (!entry) {
        const label = this.scene.add
          .dom(0, 0, "span")
          .setClassName(`world-character-label ${this.placementClass}`)
          .setOrigin(0.5, this.originY);
        entry = { label };
        this.labels.set(character.id, entry);
      }

      const { label } = entry;
      const worldPosition = resolveCharacterLabelWorldPosition(
        character,
        this.placement,
      );
      const sortY = resolveCharacterSortY(
        character.position.y,
        character.sprite.displayHeight,
        character.sprite.origin.y,
      );
      const isSelected = state.ui.selectedEntityId === character.id;
      const inView = worldView.contains(worldPosition.x, worldPosition.y);

      if (label.node.textContent !== character.name) {
        label.setText(character.name);
      }

      label
        .setPosition(worldPosition.x, worldPosition.y)
        .setDepth(
          resolveWorldRenderDepth(
            sortY,
            RENDER_DEPTH_PRIORITY.character + LABEL_DEPTH_OFFSET,
          ),
        )
        .setVisible(inView)
        .setAlpha(isSelected ? 1 : UNSELECTED_LABEL_ALPHA);

      label.node.classList.toggle("world-character-label--selected", isSelected);
    }
  }

  destroy(): void {
    for (const entry of this.labels.values()) {
      entry.label.destroy();
    }
    this.labels.clear();
  }
}
