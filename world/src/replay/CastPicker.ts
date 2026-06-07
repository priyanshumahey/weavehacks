// CastPicker — a compact, searchable roster grid for choosing a scene's cast.
// Replaces the plain text chips with portrait tiles, a live search box, and a
// running selection count. Used twice: the manual "by hand" cast and the Direct
// mode's optional cast pool. Pure DOM; it mutates the Set it's given and pings
// `onChange` so the host panel can revalidate (e.g. enable the stage button).

import { getCharacterPortraitUrl } from "../assets/characterPortraitRegistry";
import type { RosterCharacter } from "./sceneApi";

interface CastPickerOptions {
  /** Short hint shown next to the count, e.g. "pick 2–5". */
  hint?: string;
  /** Cap the selection; further picks are ignored once reached. */
  max?: number;
}

export class CastPicker {
  readonly root: HTMLDivElement;

  private readonly search: HTMLInputElement;
  private readonly count: HTMLSpanElement;
  private readonly clearButton: HTMLButtonElement;
  private readonly grid: HTMLDivElement;
  private readonly empty: HTMLParagraphElement;

  private tiles: { character: RosterCharacter; el: HTMLButtonElement }[] = [];
  private query = "";

  constructor(
    private readonly selected: Set<string>,
    private readonly onChange: () => void,
    private readonly options: CastPickerOptions = {},
  ) {
    this.root = document.createElement("div");
    this.root.className = "cast-picker";

    const bar = document.createElement("div");
    bar.className = "cast-picker__bar";

    this.search = document.createElement("input");
    this.search.type = "search";
    this.search.className = "cast-picker__search";
    this.search.placeholder = "Search the cast…";
    this.search.addEventListener("input", () => {
      this.query = this.search.value.trim().toLowerCase();
      this.applyFilter();
    });

    this.count = document.createElement("span");
    this.count.className = "cast-picker__count";

    this.clearButton = document.createElement("button");
    this.clearButton.type = "button";
    this.clearButton.className = "cast-picker__clear";
    this.clearButton.textContent = "Clear";
    this.clearButton.addEventListener("click", () => this.clear());

    bar.append(this.search, this.count, this.clearButton);

    this.grid = document.createElement("div");
    this.grid.className = "cast-picker__grid";

    this.empty = document.createElement("p");
    this.empty.className = "cast-picker__empty";
    this.empty.textContent = "No one by that name.";
    this.empty.hidden = true;

    this.root.append(bar, this.grid, this.empty);
    this.updateCount();
  }

  /** (Re)build the tiles from a roster. Keeps existing selections valid. */
  setRoster(roster: RosterCharacter[]): void {
    this.grid.replaceChildren();
    this.tiles = roster.map((character) => {
      const el = this.tile(character);
      this.grid.append(el);
      return { character, el };
    });
    this.applyFilter();
    this.updateCount();
  }

  /** Drop every selection (and refresh tile states + count). */
  clear(): void {
    if (this.selected.size === 0) {
      return;
    }
    this.selected.clear();
    for (const { el } of this.tiles) {
      el.classList.remove("cast-picker__tile--on");
      el.setAttribute("aria-pressed", "false");
    }
    this.updateCount();
    this.onChange();
  }

  private tile(character: RosterCharacter): HTMLButtonElement {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cast-picker__tile";
    el.title = character.title || character.name;
    const on = this.selected.has(character.key);
    el.classList.toggle("cast-picker__tile--on", on);
    el.setAttribute("aria-pressed", String(on));

    const avatar = document.createElement("span");
    avatar.className = "cast-picker__avatar";
    const portrait = getCharacterPortraitUrl(character.charset);
    if (portrait) {
      const img = document.createElement("img");
      img.src = portrait;
      img.alt = "";
      img.loading = "lazy";
      avatar.append(img);
    } else {
      avatar.textContent = initials(character.name);
      avatar.classList.add("cast-picker__avatar--initials");
    }

    const name = document.createElement("span");
    name.className = "cast-picker__name";
    name.textContent = character.name;

    el.append(avatar, name);
    el.addEventListener("click", () => this.toggle(character.key, el));
    return el;
  }

  private toggle(key: string, el: HTMLButtonElement): void {
    if (this.selected.has(key)) {
      this.selected.delete(key);
    } else {
      if (this.options.max && this.selected.size >= this.options.max) {
        // At the cap — flash the tile instead of silently ignoring the click.
        el.classList.remove("cast-picker__tile--bump");
        void el.offsetWidth; // restart the animation
        el.classList.add("cast-picker__tile--bump");
        return;
      }
      this.selected.add(key);
    }
    const on = this.selected.has(key);
    el.classList.toggle("cast-picker__tile--on", on);
    el.setAttribute("aria-pressed", String(on));
    this.updateCount();
    this.onChange();
  }

  private applyFilter(): void {
    let visible = 0;
    for (const { character, el } of this.tiles) {
      const match =
        !this.query ||
        character.name.toLowerCase().includes(this.query) ||
        character.title.toLowerCase().includes(this.query);
      el.hidden = !match;
      if (match) {
        visible += 1;
      }
    }
    this.empty.hidden = visible > 0 || this.tiles.length === 0;
  }

  private updateCount(): void {
    const n = this.selected.size;
    const hint = this.options.hint ? ` · ${this.options.hint}` : "";
    this.count.textContent = `${n} selected${hint}`;
    this.clearButton.disabled = n === 0;
  }
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
