import type Phaser from "phaser";
import type { WorldState } from "../../world/worldState";
import {
  buildWorldUiViewModel,
  type WorldUiViewModel,
} from "../../ui/WorldUiPresenter";

export class WorldUiRenderer {
  private readonly promptText: Phaser.GameObjects.Text;
  private readonly dialoguePanel: Phaser.GameObjects.Container;
  private readonly dialogueTitle: Phaser.GameObjects.Text;
  private readonly dialogueBody: Phaser.GameObjects.Text;
  private readonly inspectionPanel: Phaser.GameObjects.Container;
  private readonly inspectionTitle: Phaser.GameObjects.Text;
  private readonly inspectionBody: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const camera = scene.cameras.main;
    const { width, height } = camera;

    this.promptText = scene.add
      .text(width / 2, height - 56, "", {
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
      .setDepth(20)
      .setVisible(false);

    const dialogueBackground = scene.add
      .rectangle(164, height - 120, 248, 128, 0x0b1419, 0.92)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0xf6bd60, 1);
    this.dialogueTitle = scene.add.text(180, height - 162, "", {
      fontFamily: "Georgia",
      fontSize: "20px",
      color: "#f6bd60",
    });
    this.dialogueBody = scene.add.text(180, height - 134, "", {
      fontFamily: "Georgia",
      fontSize: "16px",
      color: "#f4f1de",
      wordWrap: { width: 212 },
      lineSpacing: 4,
    });
    this.dialoguePanel = scene.add
      .container(0, 0, [dialogueBackground, this.dialogueTitle, this.dialogueBody])
      .setScrollFactor(0)
      .setDepth(20)
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
      .setDepth(20)
      .setVisible(false);
  }

  render(state: WorldState): void {
    this.sync(buildWorldUiViewModel(state));
  }

  private sync(viewModel: WorldUiViewModel): void {
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
  }
}
