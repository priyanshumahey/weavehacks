// ReplayPortraitPanel — the focus dialog the observer opens by clicking a lord.
// Reuses the existing world-ui dialogue CSS (large side portrait + text panel,
// the "old way") and the portrait registry. While open it follows the
// conversation and shows the current speaker's line. Clicking the panel
// advances to the next line; Escape exits.

import { getCharacterPortraitUrl } from "../assets/characterPortraitRegistry";

/** The minimal line shape the panel renders (satisfied by ActiveLine and EnsembleTurn). */
export interface PortraitLine {
  dialogue: string;
}

export interface PortraitFocus {
  name: string;
  /** got_agents character key (e.g. "cersei"). */
  characterKey: string;
  /** Portrait lookup name (charset directory name, e.g. "cersei lannister"). */
  portraitName: string;
  line: PortraitLine;
}

/**
 * Strip any leading/trailing quotation marks the model may have wrapped the
 * dialogue in, so the panel's own quotes aren't doubled. Handles straight and
 * curly single/double quotes, repeated/nested.
 */
function stripWrappingQuotes(text: string): string {
  let result = text.trim();
  const quotes = new Set(['"', "'", "“", "”", "‘", "’", "«", "»"]);
  while (result.length >= 2 && quotes.has(result[0]) && quotes.has(result[result.length - 1])) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

export class ReplayPortraitPanel {
  private readonly root: HTMLDivElement;
  private readonly stage: HTMLDivElement;
  private readonly portrait: HTMLImageElement;
  private readonly portraitFrame: HTMLDivElement;
  private readonly nameEl: HTMLHeadingElement;
  private readonly quoteEl: HTMLQuoteElement;
  private readonly chatButton: HTMLButtonElement;
  private onAdvance: (() => void) | null = null;
  private onChat: ((characterKey: string) => void) | null = null;
  private chatCharacterKey: string | null = null;

  constructor(parent: HTMLElement = document.getElementById("app") ?? document.body) {
    const root = document.createElement("div");
    root.className = "world-ui world-ui--dialogue-open";
    this.root = root;

    this.stage = document.createElement("div");
    this.stage.className = "world-ui__dialogue-stage";
    this.stage.hidden = true;
    this.stage.style.cursor = "pointer";

    const backdrop = document.createElement("div");
    backdrop.className = "world-ui__dialogue-backdrop";
    backdrop.setAttribute("aria-hidden", "true");

    this.portraitFrame = document.createElement("div");
    this.portraitFrame.className = "world-ui__dialogue-portrait-frame";
    this.portrait = document.createElement("img");
    this.portrait.className = "world-ui__dialogue-portrait";
    this.portrait.alt = "";
    this.portrait.decoding = "async";
    this.portraitFrame.append(this.portrait);

    const panel = document.createElement("aside");
    panel.className = "world-ui__dialogue-panel";
    panel.setAttribute("aria-live", "polite");

    this.nameEl = document.createElement("h2");
    this.nameEl.className = "world-ui__dialogue-name";

    this.quoteEl = document.createElement("blockquote");
    this.quoteEl.className = "world-ui__dialogue-quote";

    panel.append(this.nameEl, this.quoteEl);

    const layout = document.createElement("div");
    layout.className = "world-ui__dialogue-layout";
    layout.append(this.portraitFrame, panel);

    this.stage.append(backdrop, layout);
    root.append(this.stage);
    parent.append(root);

    this.chatButton = document.createElement("button");
    this.chatButton.type = "button";
    this.chatButton.className = "dbg-toggle-btn world-ui__dialogue-chat";
    this.chatButton.textContent = "💬 chat freely";
    this.chatButton.title = "Open free-form character chat";
    this.chatButton.hidden = true;
    this.chatButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = this.chatCharacterKey;
      if (!key) {
        return;
      }
      if (!this.onChat) {
        console.warn("[chat] Chat freely clicked but no handler is wired");
        return;
      }
      this.onChat(key);
    });
    parent.append(this.chatButton);

    // Click anywhere on the open dialogue to advance the conversation.
    this.stage.addEventListener("click", () => this.onAdvance?.());
  }

  setOnAdvance(callback: () => void): void {
    this.onAdvance = callback;
  }

  setOnChat(callback: (characterKey: string) => void): void {
    this.onChat = callback;
  }

  setChatActive(active: boolean): void {
    this.chatButton.classList.toggle("dbg-toggle-btn--on", active);
  }

  /** Show or update the focus panel for the current speaker's line. */
  show(focus: PortraitFocus): void {
    this.stage.hidden = false;

    const url = getCharacterPortraitUrl(focus.portraitName);
    this.portraitFrame.hidden = !url;
    if (url) {
      if (this.portrait.src !== url) {
        this.portrait.src = url;
      }
      this.portrait.alt = focus.name;
    } else {
      this.portrait.removeAttribute("src");
    }

    this.nameEl.textContent = focus.name;

    this.quoteEl.textContent = `“${stripWrappingQuotes(focus.line.dialogue)}”`;

    this.chatCharacterKey = focus.characterKey;
    this.chatButton.hidden = !focus.characterKey;
  }

  hide(): void {
    this.stage.hidden = true;
    this.chatButton.hidden = true;
    this.portrait.removeAttribute("src");
  }

  isOpen(): boolean {
    return !this.stage.hidden;
  }

  /** Remove the panel from the DOM (called on scene shutdown). */
  destroy(): void {
    this.root.remove();
    this.chatButton.remove();
  }
}
