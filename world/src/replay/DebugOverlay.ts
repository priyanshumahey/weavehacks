// DebugOverlay — a developer HUD that surfaces every hidden stat the simulation
// computes but the cinematic view hides. Toggle with the backtick (`) key.
//
// Two layers:
//   1. A fixed DOM panel (top-left) with the director state (phase, beat, speed)
//      and, per conversation group, every character's live stats: the 8-drive
//      baseline, the current action + target, the deception substrate
//      (public stance vs private intent), and the inner-voice "thinking".
//   2. Lightweight in-world tags floating above each character's head showing
//      their current action, so you can read the room at a glance.
//
// Pure presentation: ReplayScene assembles a plain `DebugFrame` each update and
// hands it here. The overlay never touches the timeline or world state.

import Phaser from "phaser";
import type { SpriteAnchor } from "./DialogueLayer";

const TAG_DEPTH = 100_010;

// Canonical drive order (mirrors got_agents.cognition.drives.DRIVES).
const DRIVE_ORDER = [
  "survival",
  "power",
  "legitimacy",
  "loyalty",
  "honor",
  "vengeance",
  "wealth",
  "information",
] as const;

const MOOD_COLOR: Record<string, string> = {
  friendly: "#5fb37a",
  tense: "#c8a45c",
  hostile: "#cc5b52",
};

// Actions that signal a character is actively deceiving / striking.
const SHARP_ACTIONS = new Set(["accuse", "share_secret", "swear_oath", "ally"]);

export interface DebugCharStat {
  key: string;
  name: string;
  title?: string;
  drives?: Record<string, number>;
  /** True when this character holds the floor in their group right now. */
  isSpeaker: boolean;
  action: string | null;
  target: string | null;
  targetName: string | null;
  publicStance: string;
  privateIntent: string;
  thinking: string;
}

export interface DebugGroupStat {
  id: string;
  label: string;
  mood: string;
  focused: boolean;
  cast: DebugCharStat[];
}

export interface DebugFrame {
  title: string;
  phase: string;
  progressLabel: string;
  speed: number;
  idle: boolean;
  groups: DebugGroupStat[];
  /** Multi-act episode position, when applicable (e.g. "Act II — Reckoning"). */
  act?: { title: string; index: number; total: number };
}

export class DebugOverlay {
  /** The process-wide overlay (created once at boot via {@link install}). */
  private static instance: DebugOverlay | null = null;

  /** Create the singleton overlay. Call once, before the game boots. */
  static install(parent?: HTMLElement): DebugOverlay {
    if (!DebugOverlay.instance) {
      DebugOverlay.instance = new DebugOverlay(parent);
    }
    return DebugOverlay.instance;
  }

  /** The singleton overlay, if installed. */
  static shared(): DebugOverlay | null {
    return DebugOverlay.instance;
  }

  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly toggleBtn: HTMLButtonElement;
  private readonly tags = new Map<string, Phaser.GameObjects.Text>();
  /** The scene the in-world tags are currently bound to (changes per replay). */
  private tagScene: Phaser.Scene | null = null;
  private visible = false;
  private readonly onKeyDown: (event: KeyboardEvent) => void;

  constructor(parent: HTMLElement = document.getElementById("app") ?? document.body) {
    DebugOverlay.injectStyles();

    const root = document.createElement("div");
    root.className = "dbg-overlay";
    root.hidden = true;

    const header = document.createElement("div");
    header.className = "dbg-overlay__header";
    header.textContent = "DEBUG · stats";
    const hint = document.createElement("span");
    hint.className = "dbg-overlay__hint";
    hint.textContent = "` to toggle";
    header.append(hint);

    this.body = document.createElement("div");
    this.body.className = "dbg-overlay__body";

    root.append(header, this.body);
    parent.append(root);
    this.root = root;

    // A visible, always-available toggle button (the backtick key is easy to
    // miss and needs canvas focus). Fixed to the top-right corner.
    const btn = document.createElement("button");
    btn.className = "dbg-toggle-btn";
    btn.type = "button";
    btn.textContent = "📊 stats";
    btn.title = "Toggle debug stats overlay (`)";
    btn.addEventListener("click", () => this.toggle());
    parent.append(btn);
    this.toggleBtn = btn;

    // Global key listener so the backtick works regardless of where focus is
    // (Phaser's keyboard plugin needs the canvas focused; this does not).
    this.onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Ignore when typing into a form field.
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) {
        return;
      }
      if (event.key === "`" || event.key === "~") {
        event.preventDefault();
        this.toggle();
      }
    };
    window.addEventListener("keydown", this.onKeyDown);
  }

  isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.hidden = !visible;
    this.toggleBtn.classList.toggle("dbg-toggle-btn--on", visible);
    if (!visible) {
      this.hideTags();
    } else if (!this.tagScene) {
      // Toggled on with no scene running (e.g. the landing screen): the replay
      // loop won't feed frames, so show a hint instead of an empty panel.
      this.showPlaceholder();
    }
  }

  private showPlaceholder(): void {
    const note = document.createElement("div");
    note.className = "dbg-section dbg-empty";
    note.textContent = "No scene staged. Stage a scene to inspect live drives, actions, and the deception substrate.";
    this.body.replaceChildren(note);
  }

  /**
   * Bind in-world tags to a scene. Tags from any previous scene are dropped
   * (their GameObjects die with the old scene). Call when a replay (re)starts.
   */
  bindScene(scene: Phaser.Scene): void {
    if (this.tagScene === scene) {
      return;
    }
    this.tags.clear();
    this.tagScene = scene;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.tagScene === scene) {
        this.tags.clear();
        this.tagScene = null;
      }
    });
  }

  private hideTags(): void {
    for (const tag of this.tags.values()) {
      tag.setVisible(false);
    }
  }

  /** Update the DOM panel from a freshly assembled frame. */
  render(frame: DebugFrame): void {
    if (!this.visible) {
      return;
    }
    this.body.replaceChildren(
      this.renderDirector(frame),
      ...frame.groups.map((g) => this.renderGroup(g)),
    );
  }

  /** Float a small action tag above each character's head (in world space). */
  renderTags(
    keys: Iterable<string>,
    anchorFor: (key: string) => SpriteAnchor | null,
    tagFor: (key: string) => { text: string; color: string } | null,
  ): void {
    if (!this.tagScene) {
      return;
    }
    const live = new Set<string>();
    if (this.visible) {
      for (const key of keys) {
        const tag = tagFor(key);
        const anchor = anchorFor(key);
        if (!tag || !anchor) {
          continue;
        }
        live.add(key);
        const label = this.ensureTag(key);
        label
          .setText(tag.text)
          .setColor(tag.color)
          .setPosition(anchor.x, anchor.headTopY - 30)
          .setVisible(true);
      }
    }
    for (const [key, tag] of this.tags) {
      if (!live.has(key)) {
        tag.setVisible(false);
      }
    }
  }

  private ensureTag(key: string): Phaser.GameObjects.Text {
    let tag = this.tags.get(key);
    if (!tag && this.tagScene) {
      tag = this.tagScene.add
        .text(0, 0, "", {
          fontFamily: "monospace",
          fontSize: "11px",
          color: "#ffffff",
          backgroundColor: "#000000cc",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5, 1)
        .setDepth(TAG_DEPTH);
      this.tags.set(key, tag);
    }
    return tag!;
  }

  private renderDirector(frame: DebugFrame): HTMLElement {
    const section = document.createElement("div");
    section.className = "dbg-section dbg-section--director";

    const title = document.createElement("div");
    title.className = "dbg-director__title";
    title.textContent = frame.title || "(untitled)";

    const meta = document.createElement("div");
    meta.className = "dbg-director__meta";
    meta.append(
      pill(frame.idle ? "MINGLE" : frame.phase.toUpperCase(), frame.idle ? "#8a7fb0" : "#4a90c0"),
      pill(frame.progressLabel, "#555"),
      pill(`${frame.speed}×`, "#555"),
      pill(`${frame.groups.length} groups`, "#555"),
    );
    if (frame.act) {
      meta.append(
        pill(`ACT ${frame.act.index + 1}/${frame.act.total}`, "#9a6b4a"),
      );
    }

    section.append(title, meta);
    if (frame.act) {
      const sub = document.createElement("div");
      sub.className = "dbg-director__act";
      sub.textContent = frame.act.title;
      section.append(sub);
    }
    return section;
  }

  private renderGroup(group: DebugGroupStat): HTMLElement {
    const section = document.createElement("div");
    section.className = "dbg-section";
    if (group.focused) {
      section.classList.add("dbg-section--focused");
    }

    const head = document.createElement("div");
    head.className = "dbg-group__head";
    const dot = document.createElement("span");
    dot.className = "dbg-group__dot";
    dot.style.background = MOOD_COLOR[group.mood] ?? "#888";
    const label = document.createElement("span");
    label.className = "dbg-group__label";
    label.textContent = group.label || group.id;
    const mood = document.createElement("span");
    mood.className = "dbg-group__mood";
    mood.textContent = group.mood;
    head.append(dot, label, mood);

    section.append(head);
    for (const member of group.cast) {
      section.append(this.renderChar(member));
    }
    return section;
  }

  private renderChar(member: DebugCharStat): HTMLElement {
    const card = document.createElement("div");
    card.className = "dbg-char";
    if (member.isSpeaker) {
      card.classList.add("dbg-char--speaking");
    }

    const head = document.createElement("div");
    head.className = "dbg-char__head";
    const name = document.createElement("span");
    name.className = "dbg-char__name";
    name.textContent = member.name;
    head.append(name);
    if (member.title) {
      const title = document.createElement("span");
      title.className = "dbg-char__title";
      title.textContent = member.title;
      head.append(title);
    }
    if (member.action) {
      const sharp = SHARP_ACTIONS.has(member.action);
      const act = document.createElement("span");
      act.className = "dbg-char__action";
      act.style.color = sharp ? "#cc5b52" : "#c8a45c";
      act.textContent = member.target
        ? `${member.action} → ${member.targetName ?? member.target}`
        : member.action;
      head.append(act);
    }
    card.append(head);

    if (member.drives) {
      card.append(this.renderDrives(member.drives));
    }

    // Deception substrate: public stance vs private intent.
    if (member.publicStance || member.privateIntent) {
      const decep = document.createElement("div");
      decep.className = "dbg-char__deception";
      decep.append(
        labelled("PUBLIC", member.publicStance || "—", "#7fae7f"),
        labelled("PRIVATE", member.privateIntent || "—", "#cc8f8f"),
      );
      card.append(decep);
    }

    if (member.thinking) {
      const think = document.createElement("div");
      think.className = "dbg-char__thinking";
      think.textContent = `“${member.thinking}”`;
      card.append(think);
    }

    return card;
  }

  private renderDrives(drives: Record<string, number>): HTMLElement {
    const grid = document.createElement("div");
    grid.className = "dbg-drives";
    for (const drive of DRIVE_ORDER) {
      const value = drives[drive];
      if (value === undefined) {
        continue;
      }
      const row = document.createElement("div");
      row.className = "dbg-drive";
      const name = document.createElement("span");
      name.className = "dbg-drive__name";
      name.textContent = drive.slice(0, 4);
      const track = document.createElement("span");
      track.className = "dbg-drive__track";
      const fill = document.createElement("span");
      fill.className = "dbg-drive__fill";
      fill.style.width = `${Math.max(0, Math.min(100, value))}%`;
      fill.style.background = driveColor(value);
      track.append(fill);
      const num = document.createElement("span");
      num.className = "dbg-drive__num";
      num.textContent = String(Math.round(value));
      row.append(name, track, num);
      grid.append(row);
    }
    return grid;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    for (const tag of this.tags.values()) {
      tag.destroy();
    }
    this.tags.clear();
    this.toggleBtn.remove();
    this.root.remove();
  }

  private static stylesInjected = false;

  private static injectStyles(): void {
    if (DebugOverlay.stylesInjected) {
      return;
    }
    DebugOverlay.stylesInjected = true;
    const style = document.createElement("style");
    style.textContent = `
.dbg-overlay {
  position: fixed; top: 12px; left: 12px; z-index: 9999;
  width: 340px; max-height: calc(100vh - 24px); overflow-y: auto;
  font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px;
  color: #e8e2d0; background: rgba(14, 13, 18, 0.92);
  border: 1px solid #3a3530; border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.55); backdrop-filter: blur(3px);
  pointer-events: auto; user-select: none;
}
.dbg-overlay__header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; letter-spacing: 0.14em; color: #c8a45c;
  border-bottom: 1px solid #3a3530; position: sticky; top: 0;
  background: rgba(14, 13, 18, 0.96);
}
.dbg-overlay__hint { color: #6c655a; letter-spacing: 0; }
.dbg-overlay__body { padding: 8px; display: flex; flex-direction: column; gap: 8px; }
.dbg-section { border: 1px solid #2c2822; border-radius: 6px; padding: 8px; background: rgba(255,255,255,0.02); }
.dbg-section--director { background: rgba(74,144,192,0.08); border-color: #34404a; }
.dbg-section--focused { border-color: #c8a45c; box-shadow: 0 0 0 1px rgba(200,164,92,0.3); }
.dbg-director__title { color: #f0e8d2; font-size: 12px; margin-bottom: 6px; }
.dbg-director__meta { display: flex; flex-wrap: wrap; gap: 4px; }
.dbg-director__act { color: #d8b08a; font-size: 11px; margin-top: 5px; letter-spacing: 0.02em; }
.dbg-pill { padding: 2px 6px; border-radius: 4px; color: #fff; font-size: 10px; letter-spacing: 0.04em; }
.dbg-group__head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.dbg-group__dot { width: 8px; height: 8px; border-radius: 50%; }
.dbg-group__label { color: #d8cfb8; flex: 1; }
.dbg-group__mood { color: #6c655a; font-size: 10px; }
.dbg-char { border-top: 1px solid #211e19; padding: 6px 0; }
.dbg-char:first-of-type { border-top: none; }
.dbg-char--speaking { background: rgba(200,164,92,0.07); margin: 0 -8px; padding: 6px 8px; }
.dbg-char__head { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
.dbg-char__name { color: #f0e8d2; font-weight: 600; }
.dbg-char__title { color: #6c655a; font-size: 10px; }
.dbg-char__action { margin-left: auto; font-size: 10px; letter-spacing: 0.03em; }
.dbg-drives { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 10px; margin: 5px 0; }
.dbg-drive { display: flex; align-items: center; gap: 4px; }
.dbg-drive__name { color: #8a8270; width: 28px; text-transform: uppercase; font-size: 9px; }
.dbg-drive__track { flex: 1; height: 5px; background: #211e19; border-radius: 3px; overflow: hidden; }
.dbg-drive__fill { display: block; height: 100%; border-radius: 3px; }
.dbg-drive__num { color: #8a8270; width: 18px; text-align: right; font-size: 9px; }
.dbg-char__deception { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px; }
.dbg-kv { display: flex; flex-direction: column; gap: 1px; }
.dbg-kv__label { font-size: 8px; letter-spacing: 0.12em; }
.dbg-kv__value { color: #cfc8b6; font-size: 10px; line-height: 1.3; }
.dbg-char__thinking { color: #8a8270; font-style: italic; font-size: 10px; margin-top: 4px; line-height: 1.3; }
.dbg-empty { color: #8a8270; line-height: 1.4; }
.dbg-toggle-btn {
  position: fixed; top: 12px; right: 12px; z-index: 9998;
  font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11px;
  letter-spacing: 0.06em; color: #c8a45c; cursor: pointer;
  padding: 6px 10px; border-radius: 6px;
  background: rgba(14, 13, 18, 0.82); border: 1px solid #3a3530;
  box-shadow: 0 4px 14px rgba(0,0,0,0.4);
}
.dbg-toggle-btn:hover { background: rgba(30, 27, 22, 0.92); }
.dbg-toggle-btn--on { color: #0e0d12; background: #c8a45c; border-color: #c8a45c; }
`;
    document.head.append(style);
  }
}

function pill(text: string, color: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "dbg-pill";
  el.style.background = color;
  el.textContent = text;
  return el;
}

function labelled(label: string, value: string, color: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "dbg-kv";
  const l = document.createElement("span");
  l.className = "dbg-kv__label";
  l.style.color = color;
  l.textContent = label;
  const v = document.createElement("span");
  v.className = "dbg-kv__value";
  v.textContent = value;
  wrap.append(l, v);
  return wrap;
}

function driveColor(value: number): string {
  // Low = cool slate, high = warm gold/red, so dominant drives pop.
  if (value >= 70) return "#cc8f52";
  if (value >= 45) return "#c8a45c";
  return "#5a6a78";
}
