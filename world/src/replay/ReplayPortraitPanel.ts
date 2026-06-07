// ReplayPortraitPanel — the focus dialog the observer opens by clicking a lord.
// Reuses the existing world-ui dialogue CSS (large side portrait + text panel,
// the "old way") and the portrait registry. While open it follows the
// conversation: it shows the current speaker's line plus the public/private
// deception split. Clicking the panel advances to the next line; Escape exits.

import { getCharacterPortraitUrl } from "../assets/characterPortraitRegistry";
import { isScheming } from "./reactionEmoji";

/** The minimal line shape the panel renders (satisfied by ActiveLine and EnsembleTurn). */
export interface PortraitLine {
  dialogue: string;
  publicStance: string;
  privateIntent: string;
}

export interface PortraitFocus {
  name: string;
  /** Portrait lookup name (charset directory name, e.g. "cersei lannister"). */
  portraitName: string;
  line: PortraitLine;
}

export class ReplayPortraitPanel {
  private readonly stage: HTMLDivElement;
  private readonly portrait: HTMLImageElement;
  private readonly portraitFrame: HTMLDivElement;
  private readonly nameEl: HTMLHeadingElement;
  private readonly quoteEl: HTMLQuoteElement;
  private readonly motivesEl: HTMLDivElement;
  private readonly publicMotiveEl: HTMLDivElement;
  private readonly publicMotiveTextEl: HTMLParagraphElement;
  private readonly privateMotiveEl: HTMLDivElement;
  private readonly privateMotiveTextEl: HTMLParagraphElement;
  private onAdvance: (() => void) | null = null;

  constructor(parent: HTMLElement = document.getElementById("app") ?? document.body) {
    const root = document.createElement("div");
    root.className = "world-ui world-ui--dialogue-open";

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

    this.motivesEl = document.createElement("div");
    this.motivesEl.className = "world-ui__dialogue-motives";

    this.publicMotiveEl = document.createElement("div");
    this.publicMotiveEl.className = "world-ui__dialogue-motive world-ui__dialogue-motive--public";
    const publicLabel = document.createElement("span");
    publicLabel.className = "world-ui__dialogue-motive-label";
    publicLabel.textContent = "Public stance";
    this.publicMotiveTextEl = document.createElement("p");
    this.publicMotiveTextEl.className = "world-ui__dialogue-motive-text";
    this.publicMotiveEl.append(publicLabel, this.publicMotiveTextEl);
    this.publicMotiveEl.setAttribute("aria-label", "Public stance");

    this.privateMotiveEl = document.createElement("div");
    this.privateMotiveEl.className = "world-ui__dialogue-motive world-ui__dialogue-motive--private";
    const privateLabel = document.createElement("span");
    privateLabel.className = "world-ui__dialogue-motive-label";
    privateLabel.textContent = "Private intent";
    this.privateMotiveTextEl = document.createElement("p");
    this.privateMotiveTextEl.className = "world-ui__dialogue-motive-text";
    this.privateMotiveEl.append(privateLabel, this.privateMotiveTextEl);
    this.privateMotiveEl.setAttribute("aria-label", "Private intent");

    this.motivesEl.append(this.publicMotiveEl, this.privateMotiveEl);

    panel.append(this.nameEl, this.quoteEl, this.motivesEl);

    const layout = document.createElement("div");
    layout.className = "world-ui__dialogue-layout";
    layout.append(this.portraitFrame, panel);

    this.stage.append(backdrop, layout);
    root.append(this.stage);
    parent.append(root);

    // Click anywhere on the open dialogue to advance the conversation.
    this.stage.addEventListener("click", () => this.onAdvance?.());
  }

  setOnAdvance(callback: () => void): void {
    this.onAdvance = callback;
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

    const line = focus.line;
    this.quoteEl.textContent = `“${line.dialogue}”`;

    const hasPublic = Boolean(line.publicStance.trim());
    const hasPrivate = Boolean(line.privateIntent.trim());
    const hasMotives = hasPublic || hasPrivate;

    this.motivesEl.hidden = !hasMotives;
    this.motivesEl.classList.toggle("world-ui__dialogue-motives--single", hasMotives && hasPublic !== hasPrivate);

    this.publicMotiveEl.hidden = !hasPublic;
    if (hasPublic) {
      this.publicMotiveTextEl.textContent = line.publicStance;
    }

    this.privateMotiveEl.hidden = !hasPrivate;
    if (hasPrivate) {
      this.privateMotiveTextEl.textContent = line.privateIntent;
      this.privateMotiveEl.classList.toggle(
        "world-ui__dialogue-motive--deceptive",
        isScheming(line),
      );
    } else {
      this.privateMotiveEl.classList.remove("world-ui__dialogue-motive--deceptive");
    }
  }

  hide(): void {
    this.stage.hidden = true;
    this.portrait.removeAttribute("src");
  }

  isOpen(): boolean {
    return !this.stage.hidden;
  }
}
