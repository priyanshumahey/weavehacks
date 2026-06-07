// SceneSetupPanel — the "set up a new scene" overlay. A collapsible left drawer
// with three modes: Direct (one premise → the AI casts and splits it into
// concurrent scenes), Build by hand (pick the cast yourself), and Library
// (replay a previously generated scene without paying to regenerate it).
// Pure DOM; the scene wires `onStage` and receives the ensemble to play.

import { winterfellWorldLayout } from "../data/locations/winterfellWorldLayout";
import { applyLocationToEnsemble } from "./applyLocationToEnsemble";
import { CastPicker } from "./CastPicker";
import {
  directEpisode,
  fetchSavedScenes,
  fetchSceneRoster,
  loadSavedScene,
  stageScene,
  type RosterCharacter,
  type SavedScene,
  type SceneOptions,
} from "./sceneApi";
import type { EnsembleReplay } from "./ensembleTypes";
import { setStagedEpisode } from "./sceneContext";

type SetupMode = "direct" | "manual" | "library";

export class SceneSetupPanel {
  private readonly toggle: HTMLButtonElement;
  private readonly drawer: HTMLDivElement;
  private readonly directButton: HTMLButtonElement;
  private readonly manualButton: HTMLButtonElement;
  private readonly libraryButton: HTMLButtonElement;
  private readonly directBlock: HTMLDivElement;
  private readonly manualBlock: HTMLDivElement;
  private readonly libraryBlock: HTMLDivElement;
  private readonly genControls: HTMLDivElement;
  private readonly premiseInput: HTMLTextAreaElement;
  private readonly poolPicker: CastPicker;
  private readonly groupsSelect: HTMLSelectElement;
  private readonly mingleSelect: HTMLSelectElement;
  private readonly directStage: HTMLButtonElement;
  private readonly castPicker: CastPicker;
  private readonly settingInput: HTMLTextAreaElement;
  private readonly stakesInput: HTMLTextAreaElement;
  private readonly episodeSelect: HTMLSelectElement;
  private readonly locationSelect: HTMLSelectElement;
  private readonly locationField: HTMLElement;
  private readonly episodeField: HTMLElement;
  private readonly lengthField: HTMLElement;
  private readonly roundsSelect: HTMLSelectElement;
  private readonly stageButton: HTMLButtonElement;
  private readonly libraryList: HTMLDivElement;
  private readonly status: HTMLParagraphElement;

  private roster: RosterCharacter[] = [];
  private options: SceneOptions | null = null;
  private readonly selected = new Set<string>();
  private readonly pool = new Set<string>();
  private mode: SetupMode = "direct";
  private open = false;
  private busy = false;
  private loaded = false;

  /** Dialogue/cast document before the viewer's map choice is applied. */
  private baseEnsemble: EnsembleReplay | null = null;
  private savedScenes: SavedScene[] = [];

  private onStage: ((ensemble: EnsembleReplay) => void) | null = null;
  private onBusyChange: ((busy: boolean) => void) | null = null;

  constructor(parent: HTMLElement = document.getElementById("app") ?? document.body) {
    this.toggle = document.createElement("button");
    this.toggle.type = "button";
    this.toggle.className = "scene-setup__toggle";
    this.toggle.textContent = "✦ Stage a Scene";
    this.toggle.addEventListener("click", () => this.setOpen(!this.open));

    this.drawer = document.createElement("div");
    this.drawer.className = "scene-setup";

    const title = document.createElement("h2");
    title.className = "scene-setup__title";
    title.textContent = "Stage a Scene";

    // Mode tabs.
    const tabs = document.createElement("div");
    tabs.className = "scene-setup__tabs";
    this.directButton = this.tab("✦ Direct", "direct", "Give one premise; the AI casts and splits it");
    this.manualButton = this.tab("By hand", "manual", "Pick the cast yourself");
    this.libraryButton = this.tab("Library", "library", "Replay a saved scene");
    tabs.append(this.directButton, this.manualButton, this.libraryButton);

    // --- Direct block ------------------------------------------------------
    this.directBlock = document.createElement("div");
    this.directBlock.className = "scene-setup__block";
    this.premiseInput = document.createElement("textarea");
    this.premiseInput.className = "scene-setup__textarea scene-setup__textarea--tall";
    this.premiseInput.rows = 6;
    this.premiseInput.placeholder =
      "Describe the moment in as much detail as you like. e.g. Word spreads that " +
      "the king lies dying. Across the Red Keep, the Lannisters move to crown " +
      "Joffrey, the Starks insist on the lawful will, and old schemers smell " +
      "opportunity…";

    this.poolPicker = new CastPicker(this.pool, () => {}, {
      hint: "empty = AI chooses",
    });

    this.groupsSelect = document.createElement("select");
    this.groupsSelect.className = "scene-setup__select";
    for (const n of [2, 3, 4]) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = `up to ${n} scenes`;
      if (n === 3) {
        opt.selected = true;
      }
      this.groupsSelect.append(opt);
    }
    this.mingleSelect = document.createElement("select");
    this.mingleSelect.className = "scene-setup__select";
    for (const n of [0, 2, 3, 4]) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = n === 0 ? "no mingle" : `${n} meetings`;
      if (n === 3) {
        opt.selected = true;
      }
      this.mingleSelect.append(opt);
    }
    this.directStage = document.createElement("button");
    this.directStage.type = "button";
    this.directStage.className = "scene-setup__stage";
    this.directStage.textContent = "Direct the moment";
    this.directStage.addEventListener("click", () => void this.submitDirect());

    // --- Manual block ------------------------------------------------------
    this.manualBlock = document.createElement("div");
    this.manualBlock.className = "scene-setup__block";
    this.manualBlock.hidden = true;
    this.castPicker = new CastPicker(
      this.selected,
      () => this.updateStageButton(),
      { hint: "pick 2–5", max: 5 },
    );
    this.settingInput = document.createElement("textarea");
    this.settingInput.className = "scene-setup__textarea";
    this.settingInput.rows = 2;
    this.settingInput.placeholder =
      "the throne room, the morning the king's death is still secret…";
    this.stakesInput = document.createElement("textarea");
    this.stakesInput.className = "scene-setup__textarea";
    this.stakesInput.rows = 2;
    this.stakesInput.placeholder =
      "each means to hold the upper hand when the succession is named.";
    this.stageButton = document.createElement("button");
    this.stageButton.type = "button";
    this.stageButton.className = "scene-setup__stage";
    this.stageButton.textContent = "Summon the court";
    this.stageButton.addEventListener("click", () => void this.submit());
    this.manualBlock.append(
      this.fieldLabel("Cast", "pick 2–5"),
      this.castPicker.root,
      this.fieldLabel("Setting", "where & when"),
      this.settingInput,
      this.fieldLabel("Stakes", "what each one wants"),
      this.stakesInput,
      this.stageButton,
    );

    // --- Library block -----------------------------------------------------
    this.libraryBlock = document.createElement("div");
    this.libraryBlock.className = "scene-setup__block";
    this.libraryBlock.hidden = true;
    this.libraryList = document.createElement("div");
    this.libraryList.className = "scene-setup__library";
    this.libraryBlock.append(
      this.fieldLabel("Saved scenes", "click to replay instantly"),
      this.libraryList,
    );

    // --- Shared generation controls (hidden in Library) -------------------
    this.episodeSelect = document.createElement("select");
    this.episodeSelect.className = "scene-setup__select";
    this.locationSelect = document.createElement("select");
    this.locationSelect.className = "scene-setup__select";
    this.roundsSelect = document.createElement("select");
    this.roundsSelect.className = "scene-setup__select";
    for (const n of [1, 2, 3]) {
      const opt = document.createElement("option");
      opt.value = String(n);
      opt.textContent = `${n} round${n > 1 ? "s" : ""}`;
      if (n === 2) {
        opt.selected = true;
      }
      this.roundsSelect.append(opt);
    }
    this.locationField = this.labelled("Where", this.locationSelect);
    this.episodeField = this.labelled("Rewound to", this.episodeSelect);
    this.lengthField = this.labelled("Length", this.roundsSelect);

    this.directBlock.append(
      this.fieldLabel("Premise", "one dramatic moment, your detail"),
      this.premiseInput,
      this.fieldLabel("Cast pool", "optional — empty = AI chooses"),
      this.poolPicker.root,
      this.labelled("How many", this.groupsSelect),
      this.labelled("Mingle", this.mingleSelect),
      this.locationField,
      this.directStage,
    );

    this.genControls = document.createElement("div");
    this.genControls.className = "scene-setup__row";
    this.genControls.append(this.episodeField, this.lengthField);

    this.status = document.createElement("p");
    this.status.className = "scene-setup__status";

    this.drawer.append(
      title,
      tabs,
      this.directBlock,
      this.manualBlock,
      this.libraryBlock,
      this.genControls,
      this.status,
    );

    parent.append(this.toggle, this.drawer);
    this.renderLocationOptions();
    this.locationSelect.addEventListener("change", () => this.restageLocation());
    this.mountLocationField(this.mode);
  }

  /** The ensemble currently playing (before map stamping). Enables live location swaps. */
  seedEnsemble(ensemble: EnsembleReplay): void {
    this.baseEnsemble = ensemble;
  }

  setOnStage(cb: (ensemble: EnsembleReplay) => void): void {
    this.onStage = cb;
  }

  setOnBusyChange(cb: (busy: boolean) => void): void {
    this.onBusyChange = cb;
  }

  private tab(label: string, mode: SetupMode, hint: string): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "scene-setup__tab" + (mode === "direct" ? " scene-setup__tab--on" : "");
    btn.textContent = label;
    btn.title = hint;
    btn.addEventListener("click", () => this.setMode(mode));
    return btn;
  }

  private setMode(mode: SetupMode): void {
    this.mode = mode;
    this.directBlock.hidden = mode !== "direct";
    this.manualBlock.hidden = mode !== "manual";
    this.libraryBlock.hidden = mode !== "library";
    this.genControls.hidden = mode === "library";
    this.directButton.classList.toggle("scene-setup__tab--on", mode === "direct");
    this.manualButton.classList.toggle("scene-setup__tab--on", mode === "manual");
    this.libraryButton.classList.toggle("scene-setup__tab--on", mode === "library");
    this.mountLocationField(mode);
    if (mode === "library") {
      void this.loadLibrary();
    }
  }

  private mountLocationField(mode: SetupMode): void {
    this.locationField.remove();
    if (mode === "direct") {
      this.directBlock.insertBefore(this.locationField, this.directStage);
      return;
    }
    if (mode === "manual") {
      this.genControls.insertBefore(this.locationField, this.lengthField);
    }
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.drawer.classList.toggle("scene-setup--open", open);
    this.toggle.classList.toggle("scene-setup__toggle--active", open);
    if (open && !this.loaded) {
      void this.loadRoster();
    }
  }

  private async loadRoster(): Promise<void> {
    this.setStatus("Gathering the court…", "info");
    try {
      const { roster, options } = await fetchSceneRoster();
      this.roster = roster;
      this.options = options;
      this.renderRoster();
      this.renderOptions();
      this.loaded = true;
      this.setStatus("", "info");
    } catch (error) {
      this.setStatus(
        `Could not reach the backend (${(error as Error).message}). Is it running on :8000?`,
        "error",
      );
    }
  }

  private async loadLibrary(): Promise<void> {
    this.libraryList.replaceChildren(this.note("Loading…"));
    try {
      const scenes = await fetchSavedScenes();
      this.renderLibrary(scenes);
    } catch (error) {
      this.libraryList.replaceChildren(
        this.note(`Could not load saved scenes: ${(error as Error).message}`),
      );
    }
  }

  private renderRoster(): void {
    this.castPicker.setRoster(this.roster);
    this.poolPicker.setRoster(this.roster);
  }

  private renderLibrary(scenes: SavedScene[]): void {
    this.savedScenes = scenes;
    if (scenes.length === 0) {
      this.libraryList.replaceChildren(
        this.note("No saved scenes yet. Direct or build one and it lands here."),
      );
      return;
    }
    this.libraryList.replaceChildren();
    for (const scene of scenes) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "scene-setup__saved";
      const name = document.createElement("span");
      name.className = "scene-setup__saved-title";
      name.textContent = scene.title || scene.name;
      const meta = document.createElement("span");
      meta.className = "scene-setup__saved-meta";
      const when = new Date(scene.createdAt * 1000).toLocaleString();
      const tag = scene.kind === "episode" ? "✦ directed" : "scene";
      const plural = scene.groupCount === 1 ? "" : "s";
      meta.textContent = `${tag} · ${scene.groupCount} scene${plural} · ${when}`;
      item.append(name, meta);
      item.addEventListener("click", () => void this.replaySaved(scene.name));
      this.libraryList.append(item);
    }
  }

  private renderOptions(): void {
    if (!this.options) {
      return;
    }
    this.episodeSelect.replaceChildren();
    for (const ep of this.options.episodes) {
      const opt = document.createElement("option");
      opt.value = ep.id;
      opt.textContent = ep.label;
      this.episodeSelect.append(opt);
    }
  }

  private renderLocationOptions(): void {
    this.locationSelect.replaceChildren();
    for (const location of winterfellWorldLayout.locations) {
      const opt = document.createElement("option");
      opt.value = location.id;
      opt.textContent = location.label;
      if (location.id === winterfellWorldLayout.defaultLocationId) {
        opt.selected = true;
      }
      this.locationSelect.append(opt);
    }
  }

  private updateStageButton(): void {
    const min = this.options?.minCast ?? 2;
    const max = this.options?.maxCast ?? 5;
    const ok = !this.busy && this.selected.size >= min && this.selected.size <= max;
    this.stageButton.disabled = !ok;
    if (!this.busy) {
      this.stageButton.textContent =
        this.selected.size < min
          ? `Pick ${min - this.selected.size} more`
          : "Summon the court";
    }
  }

  private async submit(): Promise<void> {
    if (this.busy || this.selected.size < (this.options?.minCast ?? 2)) {
      return;
    }
    this.setBusy(true);
    this.setStatus("The court assembles… (this takes a few moments)", "info");
    try {
      const ensemble = await stageScene({
        cast: [...this.selected],
        setting: this.settingInput.value,
        stakes: this.stakesInput.value,
        episode: this.episodeSelect.value,
        maxRounds: Number(this.roundsSelect.value),
      });
      this.finishStage(ensemble, true);
    } catch (error) {
      this.setStatus(`The scene faltered: ${(error as Error).message}`, "error");
    } finally {
      this.setBusy(false);
    }
  }

  private async submitDirect(): Promise<void> {
    const premise = this.premiseInput.value.trim();
    if (this.busy || !premise) {
      if (!premise) {
        this.setStatus("Describe the moment first.", "info");
      }
      return;
    }
    this.setBusy(true);
    this.setStatus(
      "The showrunner is casting and splitting the moment into scenes… " +
        "(this can take a minute)",
      "info",
    );
    try {
      const ensemble = await directEpisode({
        premise,
        castPool: [...this.pool],
        episode: this.episodeSelect.value,
        maxGroups: Number(this.groupsSelect.value),
        maxRounds: Number(this.roundsSelect.value),
        encounters: Number(this.mingleSelect.value),
      });
      this.finishStage(ensemble, true);
    } catch (error) {
      this.setStatus(`The moment faltered: ${(error as Error).message}`, "error");
    } finally {
      this.setBusy(false);
    }
  }

  private async replaySaved(name: string): Promise<void> {
    if (this.busy) {
      return;
    }
    this.setBusy(true);
    this.setStatus("Restaging…", "info");
    try {
      const saved = this.savedScenes.find((scene) => scene.name === name);
      if (saved?.episode) {
        setStagedEpisode(saved.episode);
      }
      const ensemble = await loadSavedScene(name);
      this.finishStage(ensemble, true);
    } catch (error) {
      this.setStatus(`Could not replay: ${(error as Error).message}`, "error");
    } finally {
      this.setBusy(false);
    }
  }

  private finishStage(ensemble: EnsembleReplay, applyLocation: boolean): void {
    setStagedEpisode(this.episodeSelect.value);
    this.baseEnsemble = ensemble;
    this.emitStaged(ensemble, applyLocation);
    this.setStatus("", "info");
    this.setOpen(false);
  }

  private restageLocation(): void {
    if (!this.baseEnsemble || this.busy) {
      return;
    }
    this.emitStaged(this.baseEnsemble, true);
  }

  private emitStaged(ensemble: EnsembleReplay, applyLocation: boolean): void {
    const staged = applyLocation
      ? applyLocationToEnsemble(ensemble, this.locationSelect.value)
      : ensemble;
    this.onStage?.(staged);
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.directStage.disabled = busy;
    this.directStage.textContent = busy ? "Directing…" : "Direct the moment";
    this.directButton.disabled = busy;
    this.manualButton.disabled = busy;
    this.libraryButton.disabled = busy;
    this.toggle.disabled = busy;
    this.updateStageButton();
    this.onBusyChange?.(busy);
  }

  private setStatus(text: string, kind: "info" | "error"): void {
    this.status.textContent = text;
    this.status.classList.toggle("scene-setup__status--error", kind === "error");
  }

  private fieldLabel(text: string, hint: string): HTMLElement {
    const label = document.createElement("div");
    label.className = "scene-setup__label";
    const main = document.createElement("span");
    main.textContent = text;
    const sub = document.createElement("span");
    sub.className = "scene-setup__hint";
    sub.textContent = hint;
    label.append(main, sub);
    return label;
  }

  private labelled(text: string, control: HTMLElement): HTMLElement {
    const wrap = document.createElement("label");
    wrap.className = "scene-setup__field";
    const span = document.createElement("span");
    span.className = "scene-setup__field-label";
    span.textContent = text;
    wrap.append(span, control);
    return wrap;
  }

  private note(text: string): HTMLElement {
    const p = document.createElement("p");
    p.className = "scene-setup__status";
    p.textContent = text;
    return p;
  }
}
