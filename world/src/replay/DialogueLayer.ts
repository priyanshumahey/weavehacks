// In-world reaction overlay for the replay: an animated speech bubble + emoji
// floats above the active speaker's head. No
// floating text — the full dialogue is read in the focus popup. Pure
// presentation: reads sprite anchors and the director's reactions.

import Phaser from "phaser";
import {
  EMOJI_FRAME_COUNT,
  bubbleTextureKey,
  defaultBubbleName,
  emojiTextureKey,
} from "../assets/uiSpriteRegistry";

const BUBBLE_DEPTH = 100_004;
const EMOJI_DEPTH = 100_005;
const EMOJI_SCALE = 1.15;
const BUBBLE_SCALE = 1.7;
const EMOJI_FRAME_RATE = 10;
const BOB_AMPLITUDE = 2.5;
const BOB_PERIOD_MS = 2600;
const HEAD_GAP = 18; // gap above the head

export interface SpriteAnchor {
  x: number;
  y: number;
  /** Top of the head in world space (sprite origin is at the feet). */
  headTopY: number;
}

interface Overlay {
  bubble: Phaser.GameObjects.Image | null;
  emoji: Phaser.GameObjects.Sprite | null;
  emojiName: string | null;
  phase: number;
}

export class DialogueLayer {
  private readonly scene: Phaser.Scene;
  private readonly overlays = new Map<string, Overlay>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.registerEmojiAnimations();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Ensure one looping animation per loaded emoji sheet exists. */
  private registerEmojiAnimations(): void {
    for (const texture of this.scene.textures.getTextureKeys()) {
      if (!texture.startsWith("ui-emoji-")) {
        continue;
      }
      const animKey = `${texture}-loop`;
      if (this.scene.anims.exists(animKey)) {
        continue;
      }
      this.scene.anims.create({
        key: animKey,
        frames: this.scene.anims.generateFrameNumbers(texture, {
          start: 0,
          end: EMOJI_FRAME_COUNT - 1,
        }),
        frameRate: EMOJI_FRAME_RATE,
        repeat: -1,
      });
    }
  }

  /**
   * Show a reaction bubble+emoji above every keyed character with a reaction.
   * `reactionFor` returns the emoji name for a character, or null for none.
   */
  render(
    keys: Iterable<string>,
    anchorFor: (key: string) => SpriteAnchor | null,
    reactionFor: (key: string) => string | null,
  ): void {
    const live = new Set<string>();
    const now = this.scene.time.now;

    for (const key of keys) {
      const emojiName = reactionFor(key);
      const anchor = anchorFor(key);
      if (!emojiName || !anchor) {
        continue;
      }
      live.add(key);
      const overlay = this.ensureOverlay(key);
      const bob = Math.sin((now / BOB_PERIOD_MS) * Math.PI * 2 + overlay.phase) * BOB_AMPLITUDE;
      const x = anchor.x;
      const y = anchor.headTopY - HEAD_GAP + bob;

      overlay.bubble?.setPosition(x, y).setVisible(true);
      this.syncEmoji(overlay, emojiName, x, y);
    }

    for (const [key, overlay] of this.overlays) {
      if (!live.has(key)) {
        overlay.bubble?.setVisible(false);
        overlay.emoji?.setVisible(false);
      }
    }
  }

  private syncEmoji(overlay: Overlay, emojiName: string, x: number, y: number): void {
    if (!overlay.emoji) {
      overlay.emoji = this.scene.add
        .sprite(x, y, emojiTextureKey(emojiName))
        .setOrigin(0.5, 0.5)
        .setScale(EMOJI_SCALE)
        .setDepth(EMOJI_DEPTH);
    }

    const animKey = `${emojiTextureKey(emojiName)}-loop`;
    if (overlay.emojiName !== emojiName) {
      overlay.emojiName = emojiName;
      if (this.scene.anims.exists(animKey)) {
        overlay.emoji.play(animKey);
      } else {
        overlay.emoji.setTexture(emojiTextureKey(emojiName));
      }
    }
    overlay.emoji.setPosition(x, y).setVisible(true);
  }

  private ensureOverlay(key: string): Overlay {
    let overlay = this.overlays.get(key);
    if (overlay) {
      return overlay;
    }

    const bubbleKey = bubbleTextureKey(defaultBubbleName());
    const bubble = this.scene.textures.exists(bubbleKey)
      ? this.scene.add
          .image(0, 0, bubbleKey)
          .setOrigin(0.5, 0.5)
          .setScale(BUBBLE_SCALE)
          .setDepth(BUBBLE_DEPTH)
          .setVisible(false)
      : null;

    overlay = { bubble, emoji: null, emojiName: null, phase: Math.random() * Math.PI * 2 };
    this.overlays.set(key, overlay);
    return overlay;
  }

  private destroy(): void {
    for (const overlay of this.overlays.values()) {
      overlay.bubble?.destroy();
      overlay.emoji?.destroy();
    }
    this.overlays.clear();
  }
}
