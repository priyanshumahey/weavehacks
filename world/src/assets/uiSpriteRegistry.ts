// UI sprite registry — exposes the bubble and reaction-emoji art
// (copied into `src/assets/ui/`) as Vite-resolved URLs the ReplayScene loads.
// Emojis are animated sheets (160x128 = 5 cols x 4 rows of 32x32 frames).

const BUBBLE_MODULES = import.meta.glob("./ui/bubbles/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const EMOJI_MODULES = import.meta.glob("./ui/emojis/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export const EMOJI_FRAME = { width: 32, height: 32 } as const;
export const EMOJI_FRAME_COUNT = 20; // 5 columns x 4 rows

function stem(modulePath: string): string {
  const file = modulePath.split("/").pop() ?? modulePath;
  return file.replace(/\.png$/i, "").toLowerCase();
}

const bubbleUrlByName = new Map<string, string>();
for (const [path, url] of Object.entries(BUBBLE_MODULES)) {
  bubbleUrlByName.set(stem(path), url);
}

const emojiUrlByName = new Map<string, string>();
for (const [path, url] of Object.entries(EMOJI_MODULES)) {
  emojiUrlByName.set(stem(path), url);
}

export function bubbleTextureKey(name: string): string {
  return `ui-bubble-${name}`;
}

export function emojiTextureKey(name: string): string {
  return `ui-emoji-${name}`;
}

/** [textureKey, url] pairs for every bundled bubble image. */
export function listBubbleAssets(): Array<[string, string]> {
  return [...bubbleUrlByName].map(([name, url]) => [bubbleTextureKey(name), url]);
}

/** [textureKey, url] pairs for every bundled emoji sheet. */
export function listEmojiAssets(): Array<[string, string]> {
  return [...emojiUrlByName].map(([name, url]) => [emojiTextureKey(name), url]);
}

/** The set of available emoji names (file stems). */
export function availableEmojiNames(): Set<string> {
  return new Set(emojiUrlByName.keys());
}

/** A sensible default bubble (the first registered, or a known fallback). */
export function defaultBubbleName(): string {
  return bubbleUrlByName.has("bubble_white_1")
    ? "bubble_white_1"
    : (bubbleUrlByName.keys().next().value ?? "bubble_white_1");
}
