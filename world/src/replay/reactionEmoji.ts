// Maps a replay turn's typed-core action (and its deception gap) to a reaction
// emoji name. Falls back gracefully when a specific emoji was not bundled.

import { availableEmojiNames } from "../assets/uiSpriteRegistry";

/** The minimal turn shape needed to pick a reaction emoji. */
export interface ReactionInput {
  dialogue: string;
  action: string;
  publicStance: string;
  privateIntent: string;
}

// Preference lists per action — first available name wins.
const ACTION_EMOJI: Record<string, string[]> = {
  accuse: ["angry", "exclamation", "frustrated"],
  share_secret: ["slience", "thinking", "sweet"],
  swear_oath: ["yes", "love", "idea"],
  ally: ["love", "yes", "sweet"],
  pass: ["sleepy", "neutral", "slience"],
  speak: ["neutral", "thinking", "idea"],
};

// When the public stance and private intent diverge (scheming), prefer a
// "wheels turning" reaction over the plain action emoji.
const DECEPTION_EMOJI = ["thinking", "slience", "idea"];

function firstAvailable(names: string[]): string | null {
  const available = availableEmojiNames();
  for (const name of names) {
    if (available.has(name)) {
      return name;
    }
  }
  return null;
}

function isScheming(turn: ReactionInput): boolean {
  const pub = turn.publicStance.trim().toLowerCase();
  const priv = turn.privateIntent.trim().toLowerCase();
  if (!pub || !priv) {
    return false;
  }
  // Heuristic: a non-trivial private intent that is not echoed by the public
  // stance reads as a scheme. (The Python deception scorer is the precise judge;
  // this is only for choosing a reaction icon.)
  return priv !== pub && !pub.includes(priv) && !priv.includes(pub);
}

/** The reaction emoji name for a turn, or null if none should show. */
export function reactionEmojiFor(turn: ReactionInput): string | null {
  if (!turn.dialogue.trim()) {
    return null;
  }
  if (turn.action !== "speak" && turn.action !== "pass") {
    const byAction = firstAvailable(ACTION_EMOJI[turn.action] ?? []);
    if (byAction) {
      return byAction;
    }
  }
  if (isScheming(turn)) {
    const scheme = firstAvailable(DECEPTION_EMOJI);
    if (scheme) {
      return scheme;
    }
  }
  return firstAvailable(ACTION_EMOJI[turn.action] ?? ACTION_EMOJI.speak);
}
