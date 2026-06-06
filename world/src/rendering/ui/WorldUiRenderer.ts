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
  private readonly dialogueStage: HTMLDivElement;
  private readonly dialogueBackdrop: HTMLDivElement;
  private readonly dialoguePortraitFrame: HTMLDivElement;
  private readonly dialoguePortrait: HTMLImageElement;
  private readonly dialoguePanel: HTMLElement;
  private readonly dialogueName: HTMLHeadingElement;
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

    this.dialogueStage = document.createElement("div");
    this.dialogueStage.className = "world-ui__dialogue-stage";
    this.dialogueStage.hidden = true;

    this.dialogueBackdrop = document.createElement("div");
    this.dialogueBackdrop.className = "world-ui__dialogue-backdrop";
    this.dialogueBackdrop.setAttribute("aria-hidden", "true");

    this.dialoguePortraitFrame = document.createElement("div");
    this.dialoguePortraitFrame.className = "world-ui__dialogue-portrait-frame";

    this.dialoguePortrait = document.createElement("img");
    this.dialoguePortrait.className = "world-ui__dialogue-portrait";
    this.dialoguePortrait.alt = "";
    this.dialoguePortrait.decoding = "async";
    this.dialoguePortraitFrame.append(this.dialoguePortrait);

    this.dialoguePanel = document.createElement("aside");
    this.dialoguePanel.className = "world-ui__dialogue-panel";
    this.dialoguePanel.setAttribute("aria-live", "polite");

    this.dialogueName = document.createElement("h2");
    this.dialogueName.className = "world-ui__dialogue-name";

    this.dialogueBody = document.createElement("p");
    this.dialogueBody.className = "world-ui__dialogue-body";

    this.dialoguePanel.append(this.dialogueName, this.dialogueBody);

    const dialogueLayout = document.createElement("div");
    dialogueLayout.className = "world-ui__dialogue-layout";
    dialogueLayout.append(this.dialoguePortraitFrame, this.dialoguePanel);

    this.dialogueStage.append(this.dialogueBackdrop, dialogueLayout);

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
      this.dialogueStage,
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

    this.syncDialogue(viewModel.dialogue);

    const hasInspection = Boolean(viewModel.inspectionTitle);
    this.inspectionTitle.textContent = viewModel.inspectionTitle ?? "";
    this.inspectionBody.textContent = viewModel.inspectionLines.join("\n");
    this.inspectionPanel.hidden = !hasInspection;

    this.syncPlayerAppearanceSelector(viewModel);
  }

  private syncDialogue(dialogue: WorldUiViewModel["dialogue"]): void {
    const hasDialogue = Boolean(dialogue);

    this.dialogueStage.hidden = !hasDialogue;
    this.root.classList.toggle("world-ui--dialogue-open", hasDialogue);

    if (!dialogue) {
      this.dialoguePortrait.removeAttribute("src");
      this.dialoguePortrait.alt = "";
      return;
    }

    this.dialogueName.textContent = dialogue.name;
    this.dialogueBody.textContent = dialogue.body;

    const hasPortrait = Boolean(dialogue.portraitUrl);
    this.dialoguePortraitFrame.hidden = !hasPortrait;
    this.dialoguePortrait.alt = dialogue.name;

    if (dialogue.portraitUrl) {
      if (this.dialoguePortrait.src !== dialogue.portraitUrl) {
        this.dialoguePortrait.src = dialogue.portraitUrl;
      }
    } else {
      this.dialoguePortrait.removeAttribute("src");
    }
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
