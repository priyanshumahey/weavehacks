import type { WorldState } from "../../world/worldState";
import {
  buildWorldUiViewModel,
  type WorldUiViewModel,
} from "../../ui/WorldUiPresenter";

const SELECTOR_VISIBLE_COUNT = 8;

interface AppearanceOptionButton {
  id: string;
  button: HTMLButtonElement;
  label: HTMLSpanElement;
}

export class WorldUiRenderer {
  private readonly root: HTMLDivElement;
  private readonly promptEl: HTMLDivElement;
  private readonly dialoguePanel: HTMLElement;
  private readonly dialogueTitle: HTMLHeadingElement;
  private readonly dialogueBody: HTMLParagraphElement;
  private readonly inspectionPanel: HTMLElement;
  private readonly inspectionTitle: HTMLHeadingElement;
  private readonly inspectionBody: HTMLDivElement;
  private readonly scrollBackButton: HTMLButtonElement;
  private readonly scrollForwardButton: HTMLButtonElement;
  private readonly optionButtons: AppearanceOptionButton[] = [];
  private scrollOffset = 0;
  private onPlayerAppearanceSelect: ((appearanceId: string) => void) | null = null;

  constructor(parent: HTMLElement = document.getElementById("app") ?? document.body) {
    this.root = document.createElement("div");
    this.root.id = "world-ui";
    this.root.className = "world-ui";

    this.promptEl = document.createElement("div");
    this.promptEl.className = "world-ui__prompt";
    this.promptEl.hidden = true;

    this.dialoguePanel = document.createElement("aside");
    this.dialoguePanel.className = "world-ui__dialogue";
    this.dialoguePanel.hidden = true;
    this.dialogueTitle = document.createElement("h2");
    this.dialogueTitle.className = "world-ui__dialogue-title";
    this.dialogueBody = document.createElement("p");
    this.dialogueBody.className = "world-ui__dialogue-body";
    this.dialoguePanel.append(this.dialogueTitle, this.dialogueBody);

    this.inspectionPanel = document.createElement("aside");
    this.inspectionPanel.className = "world-ui__inspection";
    this.inspectionPanel.hidden = true;
    this.inspectionTitle = document.createElement("h2");
    this.inspectionTitle.className = "world-ui__inspection-title";
    this.inspectionBody = document.createElement("div");
    this.inspectionBody.className = "world-ui__inspection-body";
    this.inspectionPanel.append(this.inspectionTitle, this.inspectionBody);

    const selectorPanel = document.createElement("nav");
    selectorPanel.className = "world-ui__selector";
    selectorPanel.setAttribute("aria-label", "Character appearance");

    const selectorTitle = document.createElement("span");
    selectorTitle.className = "world-ui__selector-label";
    selectorTitle.textContent = "Character";

    this.scrollBackButton = document.createElement("button");
    this.scrollBackButton.type = "button";
    this.scrollBackButton.className = "world-ui__scroll-button";
    this.scrollBackButton.setAttribute("aria-label", "Scroll characters back");
    this.scrollBackButton.textContent = "◀";
    this.scrollBackButton.addEventListener("click", () => {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
    });

    const optionsContainer = document.createElement("div");
    optionsContainer.className = "world-ui__options";

    for (let index = 0; index < SELECTOR_VISIBLE_COUNT; index += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "world-ui__option";
      button.hidden = true;

      const label = document.createElement("span");
      label.className = "world-ui__option-label";
      button.append(label);

      button.addEventListener("click", () => {
        const option = this.optionButtons[index];
        if (option?.id) {
          this.onPlayerAppearanceSelect?.(option.id);
        }
      });

      optionsContainer.append(button);
      this.optionButtons.push({ id: "", button, label });
    }

    this.scrollForwardButton = document.createElement("button");
    this.scrollForwardButton.type = "button";
    this.scrollForwardButton.className = "world-ui__scroll-button";
    this.scrollForwardButton.setAttribute("aria-label", "Scroll characters forward");
    this.scrollForwardButton.textContent = "▶";
    this.scrollForwardButton.addEventListener("click", () => {
      this.scrollOffset += 1;
    });

    selectorPanel.append(
      selectorTitle,
      this.scrollBackButton,
      optionsContainer,
      this.scrollForwardButton,
    );

    this.root.append(
      this.promptEl,
      this.dialoguePanel,
      this.inspectionPanel,
      selectorPanel,
    );
    parent.append(this.root);
  }

  setOnPlayerAppearanceSelect(callback: (appearanceId: string) => void): void {
    this.onPlayerAppearanceSelect = callback;
  }

  render(state: WorldState): void {
    this.sync(buildWorldUiViewModel(state, this.scrollOffset, SELECTOR_VISIBLE_COUNT));
  }

  private sync(viewModel: WorldUiViewModel): void {
    this.scrollOffset = viewModel.playerAppearanceScrollOffset;

    const hasPrompt = Boolean(viewModel.promptText);
    this.promptEl.textContent = viewModel.promptText ?? "";
    this.promptEl.hidden = !hasPrompt;

    const hasDialogue = Boolean(viewModel.dialogueTitle && viewModel.dialogueBody);
    this.dialogueTitle.textContent = viewModel.dialogueTitle ?? "";
    this.dialogueBody.textContent = viewModel.dialogueBody ?? "";
    this.dialoguePanel.hidden = !hasDialogue;

    const hasInspection = Boolean(viewModel.inspectionTitle);
    this.inspectionTitle.textContent = viewModel.inspectionTitle ?? "";
    this.inspectionBody.textContent = viewModel.inspectionLines.join("\n");
    this.inspectionPanel.hidden = !hasInspection;

    this.syncPlayerAppearanceSelector(viewModel);
  }

  private syncPlayerAppearanceSelector(viewModel: WorldUiViewModel): void {
    const visibleOptions = viewModel.playerAppearanceOptions.slice(
      viewModel.playerAppearanceScrollOffset,
      viewModel.playerAppearanceScrollOffset + viewModel.playerAppearanceVisibleCount,
    );

    this.scrollBackButton.disabled = !viewModel.canScrollPlayerAppearanceBack;
    this.scrollForwardButton.disabled = !viewModel.canScrollPlayerAppearanceForward;

    for (let index = 0; index < this.optionButtons.length; index += 1) {
      const button = this.optionButtons[index];
      const option = visibleOptions[index];

      if (!option) {
        button.id = "";
        button.button.hidden = true;
        continue;
      }

      button.id = option.id;
      button.label.textContent = option.label;
      button.button.hidden = false;
      button.button.classList.toggle("world-ui__option--selected", option.selected);
    }
  }
}
