import type Phaser from "phaser";
import { resolveCharacterSortY } from "../renderDepth";
import { worldToAppPoint } from "../world/worldToAppPoint";
import type { WorldState } from "../../world/worldState";
import { resolveCharacterLabelWorldPosition } from "./resolveCharacterLabelWorldPosition";

const LABEL_HEIGHT = 19;

interface CharacterLabelElement {
  element: HTMLSpanElement;
  sortY: number;
}

export class CharacterLabelRenderer {
  private readonly root: HTMLDivElement;
  private readonly labels = new Map<string, CharacterLabelElement>();

  constructor(
    private readonly scene: Phaser.Scene,
    parent: HTMLElement = document.getElementById("app") ?? document.body,
  ) {
    this.root = document.createElement("div");
    this.root.className = "world-character-labels";
    parent.append(this.root);
  }

  render(state: WorldState): void {
    const activeCharacterIds = new Set(Object.keys(state.characters));
    const camera = this.scene.cameras.main;
    const worldView = camera.worldView;

    for (const [characterId, label] of this.labels) {
      if (activeCharacterIds.has(characterId)) {
        continue;
      }

      label.element.remove();
      this.labels.delete(characterId);
    }

    for (const character of Object.values(state.characters)) {
      let label = this.labels.get(character.id);

      if (!label) {
        const element = document.createElement("span");
        element.className = "world-character-label";
        element.textContent = character.name;
        this.root.append(element);
        label = {
          element,
          sortY: 0,
        };
        this.labels.set(character.id, label);
      }

      const worldPosition = resolveCharacterLabelWorldPosition(character, LABEL_HEIGHT);

      if (!worldView.contains(worldPosition.x, worldPosition.y)) {
        label.element.hidden = true;
        continue;
      }

      const appPosition = worldToAppPoint(
        this.scene,
        worldPosition.x,
        worldPosition.y,
      );
      const sortY = resolveCharacterSortY(
        character.position.y,
        character.sprite.displayHeight,
        character.sprite.origin.y,
      );
      const isSelected = state.ui.selectedEntityId === character.id;

      label.sortY = sortY;
      label.element.hidden = false;
      label.element.style.left = `${appPosition.x}px`;
      label.element.style.top = `${appPosition.y}px`;
      label.element.style.zIndex = String(Math.round(sortY));
      label.element.classList.toggle("world-character-label--selected", isSelected);
    }
  }
}
