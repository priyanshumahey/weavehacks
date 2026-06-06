import type Phaser from "phaser";
import { RENDER_LAYERS } from "../renderDepth";
import type { WorldState } from "../../world/worldState";
import {
  buildWorldUiViewModel,
  type WorldUiViewModel,
} from "../../ui/WorldUiPresenter";

const SELECTOR_HEIGHT = 52;
const SELECTOR_VISIBLE_COUNT = 8;
const OPTION_WIDTH = 78;
const OPTION_HEIGHT = 28;
const OPTION_GAP = 6;
const SELECTOR_PADDING_X = 12;

interface AppearanceOptionButton {
  id: string;
  background: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

export class WorldUiRenderer {
  private readonly promptText: Phaser.GameObjects.Text;
  private readonly dialoguePanel: Phaser.GameObjects.Container;
  private readonly dialogueTitle: Phaser.GameObjects.Text;
  private readonly dialogueBody: Phaser.GameObjects.Text;
  private readonly inspectionPanel: Phaser.GameObjects.Container;
  private readonly inspectionTitle: Phaser.GameObjects.Text;
  private readonly inspectionBody: Phaser.GameObjects.Text;
  private readonly selectorPanel: Phaser.GameObjects.Container;
  private readonly selectorTitle: Phaser.GameObjects.Text;
  private readonly scrollBackButton: Phaser.GameObjects.Text;
  private readonly scrollForwardButton: Phaser.GameObjects.Text;
  private readonly optionButtons: AppearanceOptionButton[] = [];
  private scrollOffset = 0;
  private onPlayerAppearanceSelect: ((appearanceId: string) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    const camera = scene.cameras.main;
    const { width, height } = camera;
    const promptY = height - SELECTOR_HEIGHT - 28;

    this.promptText = scene.add
      .text(width / 2, promptY, "", {
        fontFamily: "Georgia",
        fontSize: "18px",
        color: "#f4f1de",
        backgroundColor: "#10212bcc",
        padding: {
          x: 14,
          y: 8,
        },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(RENDER_LAYERS.uiOverlay)
      .setVisible(false);

    const dialogueBackground = scene.add
      .rectangle(164, promptY - 64, 248, 128, 0x0b1419, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0xf6bd60, 1);
    this.dialogueTitle = scene.add.text(180, promptY - 106, "", {
      fontFamily: "Georgia",
      fontSize: "20px",
      color: "#f6bd60",
    });
    this.dialogueBody = scene.add.text(180, promptY - 78, "", {
      fontFamily: "Georgia",
      fontSize: "16px",
      color: "#f4f1de",
      wordWrap: { width: 212 },
      lineSpacing: 4,
    });
    this.dialoguePanel = scene.add
      .container(0, 0, [dialogueBackground, this.dialogueTitle, this.dialogueBody])
      .setScrollFactor(0)
      .setDepth(RENDER_LAYERS.uiOverlay)
      .setVisible(false);

    const inspectionBackground = scene.add
      .rectangle(width - 292, 116, 248, 112, 0x0b1419, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x4fc3a1, 1);
    this.inspectionTitle = scene.add.text(width - 276, 132, "", {
      fontFamily: "Georgia",
      fontSize: "18px",
      color: "#4fc3a1",
    });
    this.inspectionBody = scene.add.text(width - 276, 162, "", {
      fontFamily: "Georgia",
      fontSize: "15px",
      color: "#d9fff5",
      wordWrap: { width: 216 },
      lineSpacing: 6,
    });
    this.inspectionPanel = scene.add
      .container(0, 0, [
        inspectionBackground,
        this.inspectionTitle,
        this.inspectionBody,
      ])
      .setScrollFactor(0)
      .setDepth(RENDER_LAYERS.uiOverlay)
      .setVisible(false);

    const selectorBackground = scene.add
      .rectangle(width / 2, height - SELECTOR_HEIGHT / 2, width, SELECTOR_HEIGHT, 0x09161d, 0.94)
      .setStrokeStyle(1, 0x244052, 1);
    this.selectorTitle = scene.add.text(SELECTOR_PADDING_X, height - SELECTOR_HEIGHT / 2, "Character", {
      fontFamily: "Georgia",
      fontSize: "13px",
      color: "#8aa0ad",
    }).setOrigin(0, 0.5);

    const optionsStartX = 96;
    const optionsY = height - SELECTOR_HEIGHT / 2;

    for (let index = 0; index < SELECTOR_VISIBLE_COUNT; index += 1) {
      const x = optionsStartX + index * (OPTION_WIDTH + OPTION_GAP) + OPTION_WIDTH / 2;
      const background = scene.add
        .rectangle(x, optionsY, OPTION_WIDTH, OPTION_HEIGHT, 0x10212b, 0.95)
        .setStrokeStyle(1, 0x355066, 1);
      const label = scene.add
        .text(x, optionsY, "", {
          fontFamily: "Arial, sans-serif",
          fontSize: "11px",
          color: "#f4f1de",
        })
        .setOrigin(0.5);

      background.setInteractive({ useHandCursor: true });
      background.on("pointerdown", () => {
        const option = this.optionButtons[index];
        if (option?.id) {
          this.onPlayerAppearanceSelect?.(option.id);
        }
      });

      this.optionButtons.push({
        id: "",
        background,
        label,
      });
    }

    this.scrollBackButton = scene.add
      .text(optionsStartX - 18, optionsY, "◀", {
        fontFamily: "Arial, sans-serif",
        fontSize: "14px",
        color: "#8aa0ad",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.scrollBackButton.on("pointerdown", () => {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
    });

    this.scrollForwardButton = scene.add
      .text(
        optionsStartX + SELECTOR_VISIBLE_COUNT * (OPTION_WIDTH + OPTION_GAP) - OPTION_GAP + 18,
        optionsY,
        "▶",
        {
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          color: "#8aa0ad",
        },
      )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.scrollForwardButton.on("pointerdown", () => {
      this.scrollOffset += 1;
    });

    this.selectorPanel = scene.add
      .container(0, 0, [
        selectorBackground,
        this.selectorTitle,
        this.scrollBackButton,
        this.scrollForwardButton,
        ...this.optionButtons.flatMap((option) => [option.background, option.label]),
      ])
      .setScrollFactor(0)
      .setDepth(RENDER_LAYERS.uiOverlay);
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
    this.promptText.setText(viewModel.promptText ?? "");
    this.promptText.setVisible(hasPrompt);

    const hasDialogue = Boolean(viewModel.dialogueTitle && viewModel.dialogueBody);
    this.dialogueTitle.setText(viewModel.dialogueTitle ?? "");
    this.dialogueBody.setText(viewModel.dialogueBody ?? "");
    this.dialoguePanel.setVisible(hasDialogue);

    const hasInspection = Boolean(viewModel.inspectionTitle);
    this.inspectionTitle.setText(viewModel.inspectionTitle ?? "");
    this.inspectionBody.setText(viewModel.inspectionLines.join("\n"));
    this.inspectionPanel.setVisible(hasInspection);

    this.syncPlayerAppearanceSelector(viewModel);
  }

  private syncPlayerAppearanceSelector(viewModel: WorldUiViewModel): void {
    const visibleOptions = viewModel.playerAppearanceOptions.slice(
      viewModel.playerAppearanceScrollOffset,
      viewModel.playerAppearanceScrollOffset + viewModel.playerAppearanceVisibleCount,
    );

    this.scrollBackButton.setAlpha(viewModel.canScrollPlayerAppearanceBack ? 1 : 0.35);
    this.scrollForwardButton.setAlpha(viewModel.canScrollPlayerAppearanceForward ? 1 : 0.35);

    for (let index = 0; index < this.optionButtons.length; index += 1) {
      const button = this.optionButtons[index];
      const option = visibleOptions[index];

      if (!option) {
        button.id = "";
        button.background.setVisible(false);
        button.label.setVisible(false);
        continue;
      }

      button.id = option.id;
      button.label.setText(option.label);
      button.background.setVisible(true);
      button.label.setVisible(true);
      button.background.setFillStyle(option.selected ? 0x244052 : 0x10212b, 0.95);
      button.background.setStrokeStyle(option.selected ? 2 : 1, option.selected ? 0xf6bd60 : 0x355066, 1);
      button.label.setColor(option.selected ? "#f6bd60" : "#f4f1de");
    }
  }
}
