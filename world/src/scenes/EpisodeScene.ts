// EpisodeScene — plays a continuous, multi-map EPISODE SCRIPT. Where ReplayScene
// localizes to one map and runs an ensemble on a lockstep clock, this renders
// EVERY map the script uses side by side (their real world offsets) and runs a
// ContinuousTimeline: threads begin, gather, talk, and finish independently
// across the maps, with characters walking in, regrouping, and drifting off the
// edge when their part is done.
//
// Selected with `?script=<name>` (see main.ts). Pure observer view.

import Phaser from "phaser";
import {
  EMOJI_FRAME,
  listBubbleAssets,
  listEmojiAssets,
} from "../assets/uiSpriteRegistry";
import {
  preloadCharacterSpritesheets,
} from "../rendering/characters/preloadCharacterSpritesheets";
import { ReplayRenderer } from "../rendering/world/ReplayRenderer";
import { getLocationBounds } from "../rendering/world/locationBounds";
import { getLocationById } from "../data/locations/winterfellWorldLayout";
import { createWorld } from "../world/createWorld";
import { WorldRuntime } from "../world/WorldRuntime";
import type { WorldBounds, WorldState } from "../world/worldState";
import { DialogueLayer, type SpriteAnchor } from "../replay/DialogueLayer";
import { ReplayCamera } from "../replay/ReplayCamera";
import { ReplayPortraitPanel } from "../replay/ReplayPortraitPanel";
import { TimeSlider } from "../replay/TimeSlider";
import { Minimap, type MinimapThreadPhase } from "../replay/Minimap";
import { DebugOverlay } from "../replay/DebugOverlay";
import { setStagedEpisode } from "../replay/sceneContext";
import type { CharacterChatTarget } from "../chat/CharacterChatOverlay";
import { wireCharacterChat } from "../chat/wireCharacterChat";
import { reactionEmojiFor } from "../replay/reactionEmoji";
import {
  buildEpisodeScriptStaging,
  type EpisodeScriptStaging,
} from "../replay/EpisodeScriptStaging";
import { ContinuousTimeline } from "../replay/ContinuousTimeline";
import type { EpisodeScript } from "../replay/episodeScriptTypes";

export const EPISODE_SCENE_KEY = "episode";

const SPEEDS = [1, 2, 4];

export class EpisodeScene extends Phaser.Scene {
  private script!: EpisodeScript;
  private staging!: EpisodeScriptStaging;
  private worldBounds!: WorldBounds;
  private runtime: WorldRuntime | null = null;
  private replayRenderer: ReplayRenderer | null = null;
  private timeline: ContinuousTimeline | null = null;
  private dialogue: DialogueLayer | null = null;
  private camera: ReplayCamera | null = null;
  private slider: TimeSlider | null = null;
  private debug: DebugOverlay | null = null;
  private panel: ReplayPortraitPanel | null = null;
  private minimap: Minimap | null = null;
  private chat: ReturnType<typeof wireCharacterChat> | null = null;
  /** The conversation thread whose portrait is currently open, if any. */
  private focusedThreadId: string | null = null;
  /** The last speaker shown in the panel, so we only re-render on a change. */
  private panelSpeakerKey: string | null = null;
  private playbackSpeed = SPEEDS[0];
  private readonly castByKey = new Map<string, EpisodeScript["cast"][number]>();
  /** Character key -> bounds of THEIR map, so each is clamped to its own map
   *  (the world's union bounds would let them wander off a short map's edge). */
  private readonly boundsByKey = new Map<string, WorldBounds>();

  constructor() {
    super(EPISODE_SCENE_KEY);
  }

  init(data?: { script?: EpisodeScript }): void {
    if (data?.script) {
      this.script = data.script;
    }
    this.resolveState();
  }

  private resolveState(): void {
    setStagedEpisode(this.script.episode);
    this.staging = buildEpisodeScriptStaging(this.script);
    this.worldBounds = unionOf(this.staging.locationBounds);
    this.castByKey.clear();
    for (const member of this.script.cast) {
      this.castByKey.set(member.key, member);
    }
    // Map every character (speaking + extra) to its own location's bounds.
    this.boundsByKey.clear();
    for (const thread of this.script.threads) {
      const b = this.staging.locationBounds.get(thread.locationId);
      if (b) {
        for (const member of thread.cast) {
          this.boundsByKey.set(member.key, b);
        }
      }
    }
    for (const extra of this.staging.extras) {
      this.boundsByKey.set(extra.key, extra.bounds);
    }
  }

  preload(): void {
    // Robust loader: the per-frame sprite PNGs can wedge Phaser's loader under
    // Vite; widen parallelism and re-pump a stalled queue.
    this.load.maxParallelDownloads = 48;
    this.installLoaderWatchdog();

    // Only load what this episode needs: its cast's character frames and the map
    // textures for the locations it uses. Loading the whole world asset registry
    // (every character + every prop/terrain) queues 700+ files and can wedge the
    // dev loader — and none of it is used by a continuous episode.
    preloadCharacterSpritesheets(this, this.staging.definitions);
    this.preloadMapTextures();

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

  /** Load only the background map textures for the locations this script uses. */
  private preloadMapTextures(): void {
    for (const id of this.staging.locationIds) {
      const location = getLocationById(id);
      if (!location) {
        continue;
      }
      const { textureKey, textureSourcePath } = location.map;
      if (textureKey && textureSourcePath && !this.textures.exists(textureKey)) {
        this.load.image(textureKey, textureSourcePath);
      }
    }
  }

  private installLoaderWatchdog(): void {
    const loader = this.load;
    const pump = () => {
      const inflight = (loader as unknown as { inflight: Set<unknown> }).inflight;
      const queued = (loader as unknown as { list: Set<unknown> }).list;
      if (queued.size > 0 && inflight.size === 0) {
        loader.start();
      }
    };
    // Pump on every file settle (these events fire on the loader regardless of
    // tab-visibility throttling, unlike setInterval) AND on the game's own
    // post-step (the RAF loop), so a stalled queue is always restarted.
    loader.on(Phaser.Loader.Events.FILE_COMPLETE, pump);
    loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, pump);
    const onPostStep = () => pump();
    this.game.events.on(Phaser.Core.Events.POST_STEP, onPostStep);
    const stop = () => {
      loader.off(Phaser.Loader.Events.FILE_COMPLETE, pump);
      loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, pump);
      this.game.events.off(Phaser.Core.Events.POST_STEP, onPostStep);
    };
    this.load.once(Phaser.Loader.Events.COMPLETE, stop);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stop);
    this.events.once(Phaser.Scenes.Events.DESTROY, stop);
  }

  create(): void {
    const world = createWorld({
      definitions: this.staging.definitions,
      bounds: this.worldBounds,
    });
    this.runtime = new WorldRuntime(world);

    this.replayRenderer = new ReplayRenderer(this);
    // Draw only the maps this script uses, packed side by side (split-screen),
    // at the same offsets the staging used for character coords.
    this.replayRenderer.createAtPlacements(this.runtime.getState(), this.staging.mapPlacements);

    this.timeline = new ContinuousTimeline(this.script, this.staging);
    this.dialogue = new DialogueLayer(this);
    this.camera = new ReplayCamera(this);
    this.debug = DebugOverlay.shared();
    this.debug?.bindScene(this);
    this.panel = new ReplayPortraitPanel();
    this.chat = wireCharacterChat(this.panel, (characterKey) =>
      this.resolveChatTarget(characterKey),
    );

    this.bindClicks();

    this.slider = new TimeSlider();
    this.slider.setOnTogglePlay(() => {
      this.timeline?.togglePlaying();
      this.slider?.setPlaying(!!this.timeline?.isPlaying);
    });
    this.slider.setOnCycleSpeed(() => {
      this.playbackSpeed = SPEEDS[(SPEEDS.indexOf(this.playbackSpeed) + 1) % SPEEDS.length];
      this.slider?.setSpeed(this.playbackSpeed);
    });

    this.buildMinimap();

    // Open framed on the whole world so both maps are visible.
    this.frameWorld();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.slider?.destroy();
      this.panel?.destroy();
      this.chat?.destroy();
      this.replayRenderer?.destroy();
    });
  }

  update(_time: number, _delta: number): void {
    if (!this.runtime || !this.replayRenderer || !this.timeline || !this.dialogue) {
      return;
    }
    const delta = _delta * this.playbackSpeed;

    this.timeline.update(this.runtime, this.runtime.getState(), delta);
    this.runtime.step(delta);

    // Keep every character inside THEIR OWN map. The world's bounds span all
    // maps, so the shared boundsSystem would let someone walk off a short map's
    // edge (e.g. fall off the Wall) or into the gap between maps.
    this.clampToOwnMap();

    // Characters that finished walking off the map are removed from the world so
    // they truly disappear (the renderer drops any sprite no longer in state).
    for (const key of this.timeline.consumeDeparted()) {
      this.runtime.removeCharacter(key);
    }

    const state = this.runtime.getState();
    this.replayRenderer.render(state);

    // Dialogue bubbles over every current speaker across all threads/maps.
    const speech = this.timeline.currentSpeech();
    const speakers = new Map<string, string>();
    for (const s of speech) {
      const emoji = reactionEmojiFor(s.turn);
      if (emoji) {
        speakers.set(s.speaker, emoji);
      }
    }
    this.dialogue.render(
      speakers.keys(),
      (key) => this.anchorFor(state, key),
      (key) => speakers.get(key) ?? null,
    );

    if (this.debug?.isVisible()) {
      this.debug.render(this.buildDebugFrame());
    }

    this.slider?.setProgress(this.timeline.progress);
    this.slider?.setPlaying(this.timeline.isPlaying);
    this.slider?.setLabel(this.timeline.atEnd ? "the episode has played out" : "");

    this.renderMinimap();

    this.syncPanel();
  }

  /** Keep the open portrait panel following the focused conversation: it shows
   *  whichever character in that thread is speaking right now, advancing from
   *  one speaker to the next as the beats progress. */
  private syncPanel(): void {
    if (!this.panel || !this.focusedThreadId || !this.timeline) {
      return;
    }
    // The conversation ended (all beats played, thread done): close the panel.
    if (!this.timeline.isThreadActive(this.focusedThreadId)) {
      this.panel.hide();
      this.focusedThreadId = null;
      this.panelSpeakerKey = null;
      this.slider?.setDocked("bottom");
      this.minimap?.setDocked("bottom");
      return;
    }
    const speech = this.timeline.speechForThread(this.focusedThreadId);
    if (!speech) {
      return; // a silent beat (gathering or a pass) — hold the last shown line
    }
    if (speech.speaker === this.panelSpeakerKey) {
      return; // same speaker still talking — nothing to update
    }
    const member = this.castByKey.get(speech.speaker);
    if (!member) {
      return;
    }
    this.panelSpeakerKey = speech.speaker;
    // The portrait panel occupies the bottom of the screen; move the scrubber and
    // the minimap to the top so neither overlaps the dialogue text.
    this.slider?.setDocked("top");
    this.minimap?.setDocked("top");
    this.panel.show({
      name: member.name,
      characterKey: speech.speaker,
      portraitName: member.charset,
      line: { dialogue: speech.turn.dialogue },
    });
  }

  /** Build the top-right world overview: every used map, every conversation
   *  huddle as a state dot, and the live camera viewport. Clicking a huddle
   *  flies the camera there and opens its portrait panel. */
  private buildMinimap(): void {
    if (!this.staging) {
      return;
    }
    const locations = this.staging.mapPlacements
      .map((placement) => {
        const bounds = this.staging.locationBounds.get(placement.locationId);
        const location = getLocationById(placement.locationId);
        if (!bounds || !location) {
          return null;
        }
        return { id: placement.locationId, label: location.label, bounds };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const threads = this.script.threads.flatMap((thread) => {
      const layout = this.staging.layouts.get(thread.id);
      if (!layout) {
        return [];
      }
      return [
        {
          id: thread.id,
          label: thread.label,
          mood: thread.mood,
          x: layout.centre.x,
          y: layout.centre.y,
        },
      ];
    });

    this.minimap = new Minimap({ world: this.worldBounds, locations, threads });
    this.minimap.setOnFocusThread((threadId) => this.focusThreadFromMinimap(threadId));
    this.minimap.setOnPan((worldX, worldY) => {
      this.camera?.frameOn(worldX, worldY, this.cameras.main.zoom, 500);
    });

    const teardown = () => {
      this.minimap?.destroy();
      this.minimap = null;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);
  }

  /** Push the live timeline + camera state into the minimap each frame. */
  private renderMinimap(): void {
    if (!this.minimap || !this.timeline) {
      return;
    }
    const phases = new Map<string, MinimapThreadPhase>();
    for (const thread of this.script.threads) {
      const phase = this.timeline.threadPhaseOf(thread.id);
      if (phase) {
        phases.set(thread.id, phase);
      }
    }
    const speaking = new Set(this.timeline.currentSpeech().map((s) => s.threadId));
    const view = this.cameras.main.worldView;
    this.minimap.render({
      phases,
      speaking,
      viewport: { x: view.x, y: view.y, width: view.width, height: view.height },
    });
  }

  /** Clicking a conversation in the minimap: fly there and open its panel. */
  private focusThreadFromMinimap(threadId: string): void {
    const layout = this.staging.layouts.get(threadId);
    if (layout) {
      this.camera?.frameOn(layout.centre.x, layout.centre.y, 0.8, 650);
    }
    if (this.timeline?.isThreadActive(threadId)) {
      this.focusedThreadId = threadId;
      this.panelSpeakerKey = null;
      this.syncPanel();
    }
  }

  private bindClicks(): void {
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (this.camera?.consumeDragMoved()) {
        return; // ended a pan-drag, not a click
      }
      const hit = this.characterAt(pointer.worldX, pointer.worldY);
      if (hit && this.timeline) {
        // Focus the whole conversation this character is in, so the panel
        // follows every speaker in it, not just the one clicked.
        const threadId = this.timeline.threadOfCharacter(hit);
        if (threadId) {
          this.focusedThreadId = threadId;
          this.panelSpeakerKey = null;
          this.syncPanel();
          return;
        }
        // Not in a conversation (idle/extra): show a single portrait card.
        const member = this.castByKey.get(hit);
        if (member) {
          this.focusedThreadId = null;
          this.panelSpeakerKey = null;
          this.slider?.setDocked("top");
          this.minimap?.setDocked("top");
          this.panel?.show({
            name: member.name,
            characterKey: hit,
            portraitName: member.charset,
            line: { dialogue: member.title ?? "" },
          });
        }
      } else {
        this.panel?.hide();
        this.focusedThreadId = null;
        this.panelSpeakerKey = null;
        this.slider?.setDocked("bottom");
        this.minimap?.setDocked("bottom");
      }
    });
  }

  /** The character key whose sprite footprint contains a world point, if any. */
  private characterAt(worldX: number, worldY: number): string | null {
    if (!this.runtime) {
      return null;
    }
    const state = this.runtime.getState();
    let best: { key: string; d2: number } | null = null;
    for (const c of Object.values(state.characters)) {
      const dx = c.position.x - worldX;
      // Hit box centred on the body (sprite origin is at the feet).
      const top = c.position.y - c.sprite.displayHeight;
      const midY = (c.position.y + top) / 2;
      const dy = midY - worldY;
      const within = Math.abs(dx) <= 28 && Math.abs(dy) <= c.sprite.displayHeight / 2 + 6;
      if (!within) {
        continue;
      }
      const d2 = dx * dx + dy * dy;
      if (!best || d2 < best.d2) {
        best = { key: c.id, d2 };
      }
    }
    return best?.key ?? null;
  }

  /** Clamp every character to the bounds of its own map (the shared bounds
   *  system only knows the world-wide union, which spans every map). */
  private clampToOwnMap(): void {
    if (!this.runtime) {
      return;
    }
    const state = this.runtime.getState();
    for (const character of Object.values(state.characters)) {
      const b = this.boundsByKey.get(character.id);
      if (!b) {
        continue;
      }
      const r = character.appearance.radius;
      character.position.x = Math.max(b.minX + r, Math.min(b.maxX - r, character.position.x));
      character.position.y = Math.max(b.minY + r, Math.min(b.maxY - r, character.position.y));
    }
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

  private frameWorld(): void {
    const cx = (this.worldBounds.minX + this.worldBounds.maxX) / 2;
    const cy = (this.worldBounds.minY + this.worldBounds.maxY) / 2;
    const worldW = this.worldBounds.maxX - this.worldBounds.minX;
    const worldH = this.worldBounds.maxY - this.worldBounds.minY;
    const cam = this.cameras.main;
    const zoom = Math.min(cam.width / worldW, cam.height / worldH) * 0.95;
    cam.centerOn(cx, cy);
    cam.setZoom(Phaser.Math.Clamp(zoom, 0.12, 1));
  }

  private resolveChatTarget(characterKey: string): CharacterChatTarget | null {
    const member = this.castByKey.get(characterKey);
    const stateChar = this.runtime?.getState().characters[characterKey];
    if (!member && !stateChar) {
      return null;
    }
    return {
      characterKey,
      characterName: member?.name ?? stateChar?.name ?? characterKey,
      portraitName: member?.charset ?? characterKey,
    };
  }

  private buildDebugFrame() {
    if (!this.timeline) {
      return { title: this.script.title, phase: "", progressLabel: "", speed: this.playbackSpeed, idle: false, groups: [] };
    }
    const active = new Set(this.timeline.activeThreads().map((t) => t.id));
    const speechByKey = new Map(this.timeline.currentSpeech().map((s) => [s.speaker, s]));
    const groups = this.script.threads.map((thread) => {
      const phase = this.timeline!.threadPhaseOf(thread.id);
      return {
        id: thread.id,
        label: `${thread.locationId} · ${thread.label}`,
        mood: thread.mood,
        focused: active.has(thread.id),
        cast: thread.cast.map((member) => {
          const sp = speechByKey.get(member.key);
          const isSpeaker = !!sp && sp.threadId === thread.id;
          const full = this.castByKey.get(member.key);
          const reflection = this.script.learning?.reflections?.[member.key];
          return {
            key: member.key,
            name: member.name,
            title: full?.title,
            drives: full?.drives,
            // Per-scene appraisal deltas + emotion apply to the whole huddle, not
            // just whoever is mid-sentence, so surface them for every member.
            driveDeltas: thread.driveDeltas?.[member.key],
            emotion: thread.emotion?.[member.key],
            isSpeaker,
            action: isSpeaker ? sp!.turn.action : null,
            target: isSpeaker ? sp!.turn.target : null,
            targetName: isSpeaker && sp!.turn.target ? this.castByKey.get(sp!.turn.target)?.name ?? sp!.turn.target : null,
            publicStance: isSpeaker ? sp!.turn.publicStance : "",
            privateIntent: isSpeaker ? sp!.turn.privateIntent : "",
            thinking: isSpeaker ? sp!.turn.thinking ?? "" : "",
            memory: reflection?.summary,
            relationships: reflection?.relationships,
          };
        }),
      };
    });
    return {
      title: this.script.title,
      phase: phaseSummary(this.timeline),
      progressLabel: this.timeline.progressLabel(),
      speed: this.playbackSpeed,
      idle: this.timeline.atEnd,
      groups,
    };
  }
}

function unionOf(boundsByLocation: Map<string, WorldBounds>): WorldBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boundsByLocation.values()) {
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 1024, maxY: 1024 };
  }
  return { minX, minY, maxX, maxY };
}

function phaseSummary(timeline: ContinuousTimeline): string {
  return timeline.atEnd ? "DONE" : "LIVE";
}
