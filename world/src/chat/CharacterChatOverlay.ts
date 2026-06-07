import { getCharacterPortraitUrl } from "../assets/characterPortraitRegistry";
import { getStagedEpisode } from "../replay/sceneContext";
import type { CharacterChatPanelProps } from "./CharacterChatPanel";

export interface CharacterChatTarget {
  characterKey: string;
  characterName: string;
  portraitName: string;
}

export class CharacterChatOverlay {
  private readonly host: HTMLDivElement;
  private unmount: (() => void) | null = null;
  private onCloseCallback: (() => void) | null = null;

  constructor() {
    this.host = document.createElement("div");
    this.host.id = "character-chat-root";
    document.body.append(this.host);
  }

  setOnClose(callback: (() => void) | null): void {
    this.onCloseCallback = callback;
  }

  async open(target: CharacterChatTarget): Promise<void> {
    this.close();

    const episode = getStagedEpisode();
    const portraitUrl = getCharacterPortraitUrl(target.portraitName);

    const props: CharacterChatPanelProps = {
      characterKey: target.characterKey,
      characterName: target.characterName,
      portraitUrl,
      episode,
      onClose: () => {
        this.close();
        this.onCloseCallback?.();
      },
    };

    try {
      const { mountCharacterChat } = await import("./mountCharacterChat");
      this.unmount = mountCharacterChat(this.host, props);
      this.host.dataset.open = "true";
    } catch (error) {
      console.error("[chat] failed to open character chat", error);
      this.showError(
        "Could not open chat. Check the browser console and ensure the CopilotKit runtime is running.",
      );
    }
  }

  close(): void {
    this.unmount?.();
    this.unmount = null;
    delete this.host.dataset.open;
    this.host.replaceChildren();
  }

  /** Close and notify listeners (e.g. toggle button state). */
  dismiss(): void {
    const wasOpen = this.isOpen();
    this.close();
    if (wasOpen) {
      this.onCloseCallback?.();
    }
  }

  isOpen(): boolean {
    return this.unmount !== null;
  }

  destroy(): void {
    this.close();
    this.host.remove();
  }

  private showError(message: string): void {
    this.host.replaceChildren();
    const box = document.createElement("div");
    box.className = "character-chat character-chat--error";
    box.setAttribute("role", "alert");
    const text = document.createElement("p");
    text.className = "character-chat__error-text";
    text.textContent = message;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "character-chat__send";
    close.textContent = "Close";
    close.addEventListener("click", () => this.close());
    box.append(text, close);
    this.host.append(box);
    this.host.dataset.open = "true";
  }
}
