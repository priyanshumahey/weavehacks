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
import { getWorldBounds } from "../rendering/world/getWorldBounds";
import { createWorld } from "../world/createWorld";
import { WorldRuntime } from "../world/WorldRuntime";
import type { WorldState } from "../world/worldState";
import { DialogueLayer, type SpriteAnchor } from "../replay/DialogueLayer";
import { EnsembleTimeline } from "../replay/EnsembleTimeline";
import {
  buildEnsembleStaging,
  type EnsembleStaging,
} from "../replay/EnsembleStaging";
import { GroupMovement, type GroupSpeech } from "../replay/GroupMovement";
import { ReplayCamera } from "../replay/ReplayCamera";
import { ReplayPortraitPanel } from "../replay/ReplayPortraitPanel";
import { TimeSlider } from "../replay/TimeSlider";
import { reactionEmojiFor } from "../replay/reactionEmoji";
import { loadDefaultEnsemble } from "../replay/ensembleSource";
import type { EnsembleReplay } from "../replay/ensembleTypes";

export const REPLAY_SCENE_KEY = "replay";

const OVERVIEW_ZOOM = 0.4;
const FOCUS_ZOOM = 1.0;
const START_ZOOM = 0.72;

export class ReplayScene extends Phaser.Scene {
  private replay!: EnsembleReplay;
  private staging!: EnsembleStaging;
  private runtime: WorldRuntime | null = null;
  private replayRenderer: ReplayRenderer | null = null;
  private timeline: EnsembleTimeline | null = null;
  private movement: GroupMovement | null = null;
  private dialogue: DialogueLayer | null = null;
  private observer: ReplayCamera | null = null;
  private panel: ReplayPortraitPanel | null = null;
  private slider: TimeSlider | null = null;
  private focusedGroupId: string | null = null;
  private manualMode = false;
  /** Character key -> charset (portrait) name. */
  private readonly charsetByKey = new Map<string, string>();

  constructor() {
    super(REPLAY_SCENE_KEY);
  }

  preload(): void {
    this.replay = loadDefaultEnsemble();
    this.staging = buildEnsembleStaging(this.replay, getWorldBounds());
    for (const group of this.replay.groups) {
      for (const member of group.cast) {
        this.charsetByKey.set(member.key, member.charset);
      }
    }

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

  create(): void {
    const world = createWorld({
      definitions: this.staging.definitions,
      bounds: getWorldBounds(),
    });

    this.runtime = new WorldRuntime(world);
    this.replayRenderer = new ReplayRenderer(this);
    this.replayRenderer.create(this.runtime.getState());

    this.timeline = new EnsembleTimeline(this.replay);
    this.movement = new GroupMovement();
    this.movement.initFrom(this.staging.layouts);
    this.dialogue = new DialogueLayer(this);
    this.observer = new ReplayCamera(this);
    this.panel = new ReplayPortraitPanel();
    this.panel.setOnAdvance(() => this.stepManual());

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

    this.frameStart();
    this.bindInput();
  }

  update(_time: number, delta: number): void {
    if (!this.runtime || !this.replayRenderer || !this.timeline || !this.movement || !this.dialogue) {
      return;
    }

    this.timeline.update(delta);

    const speech = this.speechByGroup();
    this.movement.update(this.runtime, this.runtime.getState(), delta, speech);
    this.runtime.step(delta);

    const state = this.runtime.getState();
    this.replayRenderer.render(state);

    const speakers = this.currentSpeakers();
    this.dialogue.render(
      speakers.keys(),
      (key) => this.anchorFor(state, key),
      (key) => speakers.get(key) ?? null,
    );

    this.syncPanel();

    this.slider?.setProgress(this.timeline.progress);
    this.slider?.setPlaying(this.timeline.isPlaying);
    this.slider?.setLabel(this.timeline.progressLabel());
  }

  // --- timeline helpers --------------------------------------------------

  /** Speaker + target per group at the current beat. */
  private speechByGroup(): Map<string, GroupSpeech> {
    const map = new Map<string, GroupSpeech>();
    if (!this.timeline) {
      return map;
    }
    for (const group of this.replay.groups) {
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
    for (const group of this.replay.groups) {
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

  // --- input -------------------------------------------------------------

  private bindInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (this.observer?.consumeDragMoved()) {
        return; // ended a fly-around drag, not a click
      }
      const hit = this.characterAt(pointer.worldX, pointer.worldY);
      if (hit) {
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
    const firstId = this.replay.groups[0]?.id;
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
    const bounds = getWorldBounds();
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    this.observer?.frameOn(cx, cy, OVERVIEW_ZOOM, 520);
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
    const group = this.replay.groups.find((g) => g.id === this.focusedGroupId);
    if (!group) {
      return;
    }
    const turn = this.timeline.activeTurn(group);
    if (!turn || !turn.dialogue.trim() || turn.dialogue.trim() === "...") {
      return; // silent beat — hold the last shown line
    }
    this.panel.show({
      name: turn.speakerName,
      portraitName: this.charsetByKey.get(turn.speaker) ?? turn.speaker,
      line: turn,
    });
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
