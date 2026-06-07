import Phaser from "phaser";
import { preloadWorldAssets } from "../assets/worldAssetRegistry";
import {
  EMOJI_FRAME,
  listBubbleAssets,
  listEmojiAssets,
} from "../assets/uiSpriteRegistry";
import {
  collectCharacterTextureKeys,
  preloadCharacterSpritesheets,
} from "../rendering/characters/preloadCharacterSpritesheets";
import { ReplayRenderer } from "../rendering/world/ReplayRenderer";
import { getLocalLocationBoundsById } from "../rendering/world/locationBounds";
import { resolveEnsembleLocationId } from "../replay/applyLocationToEnsemble";
import { createWorld } from "../world/createWorld";
import { WorldRuntime } from "../world/WorldRuntime";
import type { LocationId } from "../types/location";
import type { WorldBounds, WorldState } from "../world/worldState";
import { DialogueLayer, type SpriteAnchor } from "../replay/DialogueLayer";
import { EnsembleTimeline } from "../replay/EnsembleTimeline";
import type { EnsembleStaging } from "../replay/EnsembleStaging";
import { GroupMovement, type GroupSpeech } from "../replay/GroupMovement";
import {
  buildEpisodeStaging,
  isMultiAct,
  type ActStaging,
  type EpisodeStaging,
} from "../replay/EpisodeStaging";
import { AmbientWander } from "../replay/AmbientWander";
import { EncounterDirector } from "../replay/EncounterDirector";
import { ReplayCamera } from "../replay/ReplayCamera";
import { ReplayPortraitPanel } from "../replay/ReplayPortraitPanel";
import { CharacterChatOverlay } from "../chat/CharacterChatOverlay";
import type { CharacterChatTarget } from "../chat/CharacterChatOverlay";
import { wireCharacterChat } from "../chat/wireCharacterChat";
import { DebugOverlay, type DebugFrame } from "../replay/DebugOverlay";
import { TimeSlider } from "../replay/TimeSlider";
import { reactionEmojiFor } from "../replay/reactionEmoji";
import { loadDefaultEnsemble } from "../replay/ensembleSource";
import type { EnsembleGroup, EnsembleReplay } from "../replay/ensembleTypes";
import type { ReplayCastMember } from "../replay/replayTypes";

export const REPLAY_SCENE_KEY = "replay";

/** True when the app is in episode-script mode (?script=<name>), in which case
 *  the EpisodeScene plays and ReplayScene must not load or run. */
function isEpisodeScriptMode(): boolean {
  return (
    typeof window !== "undefined" &&
    !!new URLSearchParams(window.location.search).get("script")
  );
}

const OVERVIEW_ZOOM = 0.4;
const FOCUS_ZOOM = 1.0;
const START_ZOOM = 0.72;

// Actions that read as a sharp/aggressive move (colour the debug tags).
const SHARP_ACTIONS = new Set(["accuse", "share_secret", "swear_oath", "ally"]);

// Playback speed multipliers the speed button cycles through.
const SPEEDS: number[] = [1, 2, 4];

export class ReplayScene extends Phaser.Scene {
  private replay!: EnsembleReplay;
  private staging!: EnsembleStaging;
  /** The whole episode staged for in-place playback (one act, or many). */
  private episode!: EpisodeStaging;
  /** Index of the act currently playing. */
  private actIndex = 0;
  /** The groups of the act currently playing (what the timeline drives). */
  private activeGroups: EnsembleGroup[] = [];
  private activeLocationId!: LocationId;
  private locationBounds!: WorldBounds;
  private runtime: WorldRuntime | null = null;
  private replayRenderer: ReplayRenderer | null = null;
  private timeline: EnsembleTimeline | null = null;
  private movement: GroupMovement | null = null;
  private ambient: AmbientWander | null = null;
  private encounters: EncounterDirector | null = null;
  private dialogue: DialogueLayer | null = null;
  private observer: ReplayCamera | null = null;
  private panel: ReplayPortraitPanel | null = null;
  private chat: CharacterChatOverlay | null = null;
  private debug: DebugOverlay | null = null;
  private slider: TimeSlider | null = null;
  private focusedGroupId: string | null = null;
  /** Character key from the most recent sprite click (for free chat). */
  private focusedCharacterKey: string | null = null;
  private manualMode = false;
  private playbackSpeed: number = SPEEDS[0];
  /** Injected ensemble (a freshly staged scene), if the scene was started with one. */
  private injectedReplay: EnsembleReplay | null = null;
  /** True when the app is in episode-script mode and this scene should not run. */
  private disabled = false;
  /** Character key -> charset (portrait) name. */
  private readonly charsetByKey = new Map<string, string>();
  /** Character key -> full cast member (name, title, drives) for the debug HUD. */
  private readonly castByKey = new Map<string, ReplayCastMember>();

  constructor() {
    super(REPLAY_SCENE_KEY);
  }

  init(data?: { replay?: EnsembleReplay }): void {
    // When the app is in episode-script mode (?script=<name>), the EpisodeScene
    // plays instead. ReplayScene auto-starts (it is first in the scene list), so
    // bail before preload to avoid double-loading the sprite sheets.
    if (isEpisodeScriptMode()) {
      this.disabled = true;
      this.scene.stop();
      return;
    }
    this.disabled = false;
    this.injectedReplay = data?.replay ?? null;
    this.focusedGroupId = null;
    this.manualMode = false;
    this.resolveReplayState();
  }

  preload(): void {
    if (this.disabled || isEpisodeScriptMode()) {
      return;
    }
    // The cast's charsets explode into hundreds of individual frame PNGs. Under
    // the Vite dev server this can wedge Phaser's loader: it drains its
    // in-flight set to zero while files are still PENDING and then stops
    // pumping the queue, leaving the scene stuck in LOADING forever. Widen the
    // parallelism and watchdog the queue so a stalled batch is re-pumped.
    this.load.maxParallelDownloads = 48;
    this.installLoaderWatchdog();

    preloadCharacterSpritesheets(this, this.staging.definitions);
    preloadWorldAssets(this, new Set(collectCharacterTextureKeys(this.staging.definitions)));

    for (const [key, url] of listBubbleAssets()) {
      this.load.image(key, url);
    }
    for (const [key, url] of listEmojiAssets()) {
      this.load.spritesheet(key, url, {
        frameWidth: EMOJI_FRAME.width,
        frameHeight: EMOJI_FRAME.height,
      });
    }
  }

  /**
   * Guard against the Phaser loader stalling mid-load (in-flight set empty but
   * files still pending). Polls during the load and re-pumps the queue; tears
   * itself down once the load completes.
   */
  private installLoaderWatchdog(): void {
    const loader = this.load;
    const timer = window.setInterval(() => {
      // `inflight` and `list` are public on the loader plugin at runtime.
      const inflight = (loader as unknown as { inflight: Set<unknown> }).inflight;
      const queued = (loader as unknown as { list: Set<unknown> }).list;
      if (queued.size > 0 && inflight.size === 0) {
        loader.start();
      }
    }, 200);
    const stop = () => window.clearInterval(timer);
    this.load.once(Phaser.Loader.Events.COMPLETE, stop);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    this.events.once(Phaser.Scenes.Events.DESTROY, stop);
  }

  create(): void {
    if (this.disabled || isEpisodeScriptMode()) {
      return;
    }
    const world = createWorld({
      definitions: this.staging.definitions,
      bounds: this.locationBounds,
    });

    this.runtime = new WorldRuntime(world);
    this.replayRenderer = new ReplayRenderer(this);
    this.replayRenderer.create(this.runtime.getState(), this.activeLocationId);

    this.timeline = new EnsembleTimeline(this.currentActReplay());
    this.movement = new GroupMovement();
    this.movement.initFrom(this.staging.layouts);
    this.ambient = new AmbientWander();
    this.ambient.initFrom(this.staging);
    this.encounters = new EncounterDirector(this.replay.encounters);
    this.dialogue = new DialogueLayer(this);
    this.observer = new ReplayCamera(this);
    this.panel = new ReplayPortraitPanel();
    this.panel.setOnAdvance(() => this.stepManual());
    this.chat = wireCharacterChat(this.panel, (characterKey) =>
      this.resolveChatTarget(characterKey),
    );
    // The debug overlay is a persistent, boot-level singleton (installed in
    // main.ts before the game boots). Grab it and bind its in-world tags to
    // this scene; there is exactly one overlay + toggle button for the app.
    this.debug = DebugOverlay.shared();
    this.debug?.bindScene(this);

    this.slider = new TimeSlider();
    this.slider.setOnSeek((fraction) => {
      this.manualMode = true;
      this.timeline?.setPlaying(false);
      this.timeline?.setProgress(fraction);
      this.slider?.setPlaying(false);
    });
    this.slider.setOnTogglePlay(() => {
      if (!this.timeline) {
        return;
      }
      this.timeline.togglePlaying();
      this.manualMode = !this.timeline.isPlaying;
      this.slider?.setPlaying(this.timeline.isPlaying);
    });
    this.slider.setOnCycleSpeed(() => {
      const next = SPEEDS[(SPEEDS.indexOf(this.playbackSpeed) + 1) % SPEEDS.length];
      this.playbackSpeed = next;
      this.slider?.setSpeed(next);
    });
    this.slider.setSpeed(this.playbackSpeed);

    this.frameStart();
    this.bindInput();

    // DOM overlays do not belong to the Phaser display list, so remove them
    // explicitly when the scene shuts down (e.g. restarting with a new scene).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.slider?.destroy();
      this.panel?.destroy();
      this.chat?.destroy();
      this.replayRenderer?.destroy();
    });
  }

  /** Phaser skips preload on scene.restart(); init always rebuilds staging. */
  private resolveReplayState(): void {
    this.replay = this.injectedReplay ?? loadDefaultEnsemble();
    this.activeLocationId = resolveEnsembleLocationId(this.replay);
    this.locationBounds = getLocalLocationBoundsById(this.activeLocationId);

    // Stage the whole episode: every character spawned once (union across acts)
    // with per-act layouts, so the cast persists and walks between acts.
    this.episode = buildEpisodeStaging(this.replay, {
      localizeToLocationId: this.activeLocationId,
    });
    this.actIndex = 0;
    const firstAct = this.episode.acts[0];
    this.activeGroups = firstAct.groups;
    // `staging` drives world creation (union definitions) and the first act's
    // huddle layout / membership.
    this.staging = {
      definitions: this.episode.definitions,
      layouts: firstAct.staging.layouts,
      groupIdByCharacter: firstAct.staging.groupIdByCharacter,
    };

    // Cast lookups span the whole episode so portraits and the debug HUD work
    // for any character in any act, not just the opening one.
    this.charsetByKey.clear();
    this.castByKey.clear();
    for (const act of this.episode.acts) {
      for (const group of act.groups) {
        for (const member of group.cast) {
          this.charsetByKey.set(member.key, member.charset);
          this.castByKey.set(member.key, member);
        }
      }
    }
  }

  /** A self-contained replay for the act currently playing (drives the clock).
   *  Encounters ride along only on the final act, so the post-episode mingle
   *  plays once, after the whole story has resolved. */
  private currentActReplay(): EnsembleReplay {
    const isLast = this.actIndex >= this.episode.acts.length - 1;
    return {
      version: this.replay.version,
      title: this.episode.acts[this.actIndex].title,
      groups: this.activeGroups,
      encounters: isLast ? this.replay.encounters : undefined,
    };
  }

  /** Advance to the next act: re-form the groups and re-point the cast so they
   *  walk from their old huddles into the new ones, then start the act's clock. */
  private advanceAct(): void {
    if (this.actIndex >= this.episode.acts.length - 1) {
      return;
    }
    this.actIndex += 1;
    const act: ActStaging = this.episode.acts[this.actIndex];
    this.activeGroups = act.groups;
    // Re-point staging + movement at the new act; characters keep their world
    // positions and walk to their new huddle homes (the between-act movement).
    this.staging.layouts = act.staging.layouts;
    this.staging.groupIdByCharacter = act.staging.groupIdByCharacter;
    this.movement?.restage(act.staging.layouts);
    // The post-episode mingle should disperse from the final act's cast and
    // positions, so re-seed the ambient roamers as we enter the last act.
    if (this.actIndex >= this.episode.acts.length - 1) {
      this.ambient?.initFrom({
        definitions: this.episode.definitions,
        layouts: act.staging.layouts,
        groupIdByCharacter: act.staging.groupIdByCharacter,
      });
    }
    // A fresh clock for the act — it opens in its ENTERING phase, so the walk
    // to the new huddles reads as the scene change.
    this.timeline = new EnsembleTimeline(this.currentActReplay());
    this.timeline.setPlaying(!this.manualMode);
    // The previous act's group ids are gone; drop any stale focus and pull back
    // to take in the whole new tableau.
    this.focusedGroupId = null;
    this.panel?.hide();
    this.frameOverview();
  }

  update(_time: number, _delta: number): void {
    if (!this.runtime || !this.replayRenderer || !this.timeline || !this.movement || !this.dialogue) {
      return;
    }

    // Scale the whole world by the chosen playback speed (talking, walking,
    // mingling, and the sim all advance together).
    const delta = _delta * this.playbackSpeed;

    this.timeline.update(delta);

    // When an act finishes, advance to the next one instead of dispersing: the
    // cast walks from their old huddles into the next act's groupings (merge /
    // split / confront), and the new act's clock starts. Only after the FINAL
    // act does the world go ambient and the mingle play.
    if (this.timeline.atEnd && this.actIndex < this.episode.acts.length - 1) {
      this.advanceAct();
    }

    // Once the conversation has fully played out, the world goes ambient: the
    // cast disperses from their huddles and roams the room with purpose, while
    // the precomputed mingle stages incidental meetings between pairs.
    const idle = this.timeline.atEnd;
    let encounterSpeakers = new Map<string, string>();
    if (idle && this.ambient) {
      const state0 = this.runtime.getState();
      let claimed: ReadonlySet<string> | undefined;
      if (this.encounters) {
        this.encounters.update(this.runtime, state0, delta);
        claimed = this.encounters.claimed();
        const { speaker, turn } = this.encounters.speech();
        if (speaker && turn) {
          const emoji = reactionEmojiFor(turn);
          if (emoji) {
            encounterSpeakers.set(speaker, emoji);
          }
        }
      }
      this.ambient.update(this.runtime, state0, delta, claimed);
    } else {
      const entering = this.timeline.isEntering;
      const speech = this.speechByGroup();
      this.movement.update(this.runtime, this.runtime.getState(), delta, speech, entering);
    }
    this.runtime.step(delta);

    const state = this.runtime.getState();
    this.replayRenderer.render(state);

    const speakers = idle ? encounterSpeakers : this.currentSpeakers();
    this.dialogue.render(
      speakers.keys(),
      (key) => this.anchorFor(state, key),
      (key) => speakers.get(key) ?? null,
    );

    this.syncPanel();

    if (this.debug?.isVisible()) {
      this.debug.render(this.buildDebugFrame(idle));
      const tags = this.debugTags(idle, encounterSpeakers);
      this.debug.renderTags(
        tags.keys(),
        (key) => this.anchorFor(state, key),
        (key) => tags.get(key) ?? null,
      );
    }

    this.slider?.setProgress(this.timeline.progress);
    this.slider?.setPlaying(this.timeline.isPlaying);
    this.slider?.setLabel(this.sliderLabel(idle));
  }

  /** The scrubber caption: act + beat during a multi-act episode, else the
   *  plain beat / mingle label. */
  private sliderLabel(idle: boolean): string {
    if (idle) {
      return "the court mingles…";
    }
    const beat = this.timeline?.progressLabel() ?? "";
    if (isMultiAct(this.replay)) {
      const actTitle = this.episode.acts[this.actIndex]?.title ?? "";
      return actTitle ? `${actTitle} · ${beat}` : beat;
    }
    return beat;
  }

  // --- timeline helpers --------------------------------------------------

  /** Speaker + target per group at the current beat. */
  private speechByGroup(): Map<string, GroupSpeech> {
    const map = new Map<string, GroupSpeech>();
    if (!this.timeline) {
      return map;
    }
    for (const group of this.activeGroups) {
      const speaker = this.timeline.speakerOf(group);
      const turn = this.timeline.activeTurn(group);
      map.set(group.id, { speaker, target: turn?.target ?? null });
    }
    return map;
  }

  /** Speaker key -> reaction emoji name, across every group. */
  private currentSpeakers(): Map<string, string> {
    const map = new Map<string, string>();
    if (!this.timeline) {
      return map;
    }
    for (const group of this.activeGroups) {
      const speaker = this.timeline.speakerOf(group);
      const turn = this.timeline.activeTurn(group);
      if (speaker && turn) {
        const emoji = reactionEmojiFor(turn);
        if (emoji) {
          map.set(speaker, emoji);
        }
      }
    }
    return map;
  }

  // --- debug overlay -----------------------------------------------------

  /** Assemble the full stats frame the debug overlay renders this update. */
  private buildDebugFrame(idle: boolean): DebugFrame {
    const groups = this.activeGroups.map((group) => {
      const turn = this.timeline && !idle ? this.timeline.activeTurn(group) : null;
      const speakerKey =
        this.timeline && !idle ? this.timeline.speakerOf(group) : null;
      return {
        id: group.id,
        label: group.label,
        mood: group.mood,
        focused: this.focusedGroupId === group.id,
        cast: group.cast.map((member) => {
          const active = !!turn && turn.speaker === member.key;
          return {
            key: member.key,
            name: member.name,
            title: member.title,
            drives: member.drives,
            isSpeaker: !!speakerKey && speakerKey === member.key,
            action: active ? turn.action : null,
            target: active ? turn.target : null,
            targetName:
              active && turn.target
                ? this.castByKey.get(turn.target)?.name ?? turn.target
                : null,
            publicStance: active ? turn.publicStance : "",
            privateIntent: active ? turn.privateIntent : "",
            thinking: active ? turn.thinking ?? "" : "",
          };
        }),
      };
    });

    return {
      title: this.replay.title || "",
      phase: this.timeline?.phase ?? "",
      progressLabel: idle
        ? "the court mingles"
        : this.timeline?.progressLabel() ?? "",
      speed: this.playbackSpeed,
      idle,
      groups,
      act: isMultiAct(this.replay)
        ? {
            title: this.episode.acts[this.actIndex]?.title ?? "",
            index: this.actIndex,
            total: this.episode.acts.length,
          }
        : undefined,
    };
  }

  /** Action tags floating above each current speaker's head (debug only). */
  private debugTags(
    idle: boolean,
    encounterSpeakers: Map<string, string>,
  ): Map<string, { text: string; color: string }> {
    const map = new Map<string, { text: string; color: string }>();
    if (!this.timeline) {
      return map;
    }
    if (idle) {
      for (const key of encounterSpeakers.keys()) {
        map.set(key, { text: "mingling", color: "#cfc8b6" });
      }
      return map;
    }
    for (const group of this.activeGroups) {
      const speaker = this.timeline.speakerOf(group);
      const turn = this.timeline.activeTurn(group);
      if (!speaker || !turn) {
        continue;
      }
      const sharp = SHARP_ACTIONS.has(turn.action);
      const targetName = turn.target
        ? this.castByKey.get(turn.target)?.name ?? turn.target
        : null;
      map.set(speaker, {
        text: targetName ? `${turn.action} → ${targetName}` : turn.action,
        color: sharp ? "#ff8a80" : "#ffd479",
      });
    }
    return map;
  }

  // --- input -------------------------------------------------------------

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (this.observer?.consumeDragMoved()) {
        return; // ended a fly-around drag, not a click
      }
      const hit = this.characterAt(pointer.worldX, pointer.worldY);
      if (hit) {
        this.focusedCharacterKey = hit;
        const groupId = this.staging.groupIdByCharacter.get(hit) ?? null;
        if (groupId) {
          this.focusGroup(groupId);
        }
        return;
      }
      // Clicked empty ground: leave the conversation, pull back to overview.
      if (this.focusedGroupId) {
        this.focusedGroupId = null;
        this.panel?.hide();
        this.frameOverview();
      }
    });

    this.input.keyboard?.on("keydown-ESC", () => {
      this.focusedGroupId = null;
      this.panel?.hide();
      this.frameOverview();
    });
    this.input.keyboard?.on("keydown-SPACE", () => this.stepManual());
    this.input.keyboard?.on("keydown-RIGHT", () => this.stepManual());
    // The backtick toggle lives on the persistent DebugOverlay (a global
    // window listener), so it works regardless of canvas focus or scene state.
  }

  private focusGroup(groupId: string): void {
    this.focusedGroupId = groupId;
    this.slider?.setDocked("top");
    const centre = this.staging.layouts.get(groupId)?.centre;
    if (centre) {
      this.observer?.frameOn(centre.x, centre.y, FOCUS_ZOOM);
    }
  }

  /** Open on the first group so the viewer lands inside a conversation. */
  private frameStart(): void {
    const firstId = this.activeGroups[0]?.id;
    const centre = firstId ? this.staging.layouts.get(firstId)?.centre : null;
    if (centre) {
      this.cameras.main.centerOn(centre.x, centre.y);
      this.cameras.main.setZoom(START_ZOOM);
    } else {
      this.frameOverview();
    }
  }

  private stepManual(): void {
    if (!this.timeline) {
      return;
    }
    this.manualMode = true;
    this.timeline.setPlaying(false);
    this.timeline.stepForward();
    this.slider?.setPlaying(false);
  }

  private frameOverview(): void {
    this.slider?.setDocked("bottom");
    const content = this.contentBounds();
    const cx = (content.minX + content.maxX) / 2;
    const cy = (content.minY + content.maxY) / 2;

    const cam = this.cameras.main;
    const pad = 160;
    const w = content.maxX - content.minX + pad * 2;
    const h = content.maxY - content.minY + pad * 2;
    const fit = Math.min(cam.width / w, cam.height / h);
    const zoom = Math.max(OVERVIEW_ZOOM, Math.min(fit, 1));
    this.observer?.frameOn(cx, cy, zoom, 520);
  }

  /** Bounding box of all group huddles (falls back to the location playfield). */
  private contentBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const layouts = [...this.staging.layouts.values()];
    if (layouts.length === 0) {
      return this.locationBounds;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const layout of layouts) {
      const r = layout.radius + 80;
      minX = Math.min(minX, layout.centre.x - r);
      minY = Math.min(minY, layout.centre.y - r);
      maxX = Math.max(maxX, layout.centre.x + r);
      maxY = Math.max(maxY, layout.centre.y + r);
    }
    return { minX, minY, maxX, maxY };
  }

  private characterAt(worldX: number, worldY: number): string | null {
    const state = this.runtime?.getState();
    if (!state) {
      return null;
    }
    let best: { key: string; dist: number } | null = null;
    for (const character of Object.values(state.characters)) {
      const dx = Math.abs(worldX - character.position.x);
      const top = character.position.y - character.sprite.displayHeight - 12;
      const bottom = character.position.y + 14;
      if (dx <= 34 && worldY >= top && worldY <= bottom) {
        const midY = character.position.y - character.sprite.displayHeight / 2;
        const dist = dx + Math.abs(worldY - midY);
        if (!best || dist < best.dist) {
          best = { key: character.id, dist };
        }
      }
    }
    return best?.key ?? null;
  }

  // --- panel & overlays --------------------------------------------------

  private syncPanel(): void {
    if (!this.panel || !this.timeline || !this.focusedGroupId) {
      if (this.panel?.isOpen()) {
        this.panel.hide();
      }
      return;
    }
    const group = this.activeGroups.find((g) => g.id === this.focusedGroupId);
    if (!group) {
      return;
    }
    const turn = this.timeline.activeTurn(group);
    if (!turn || !turn.dialogue.trim() || turn.dialogue.trim() === "...") {
      return; // silent beat — hold the last shown line
    }
    this.panel.show({
      name: turn.speakerName,
      characterKey: this.focusedCharacterKey ?? turn.speaker,
      portraitName: this.charsetByKey.get(turn.speaker) ?? turn.speaker,
      line: turn,
    });
  }

  private resolveChatTarget(characterKey: string): CharacterChatTarget | null {
    const member = this.castByKey.get(characterKey);
    const stateChar = this.runtime?.getState().characters[characterKey];
    if (!member && !stateChar) {
      return null;
    }
    const portraitName =
      member?.charset ?? this.charsetByKey.get(characterKey) ?? characterKey;
    return {
      characterKey,
      characterName: member?.name ?? stateChar?.name ?? characterKey,
      portraitName,
    };
  }

  private anchorFor(state: WorldState, key: string): SpriteAnchor | null {
    const character = state.characters[key];
    if (!character) {
      return null;
    }
    return {
      x: character.position.x,
      y: character.position.y,
      headTopY: character.position.y - character.sprite.displayHeight,
    };
  }
}
