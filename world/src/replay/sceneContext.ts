/** Shared staging context between the setup panel and the replay scene. */

const BROWSER_SESSION = `world-${Math.random().toString(36).slice(2, 8)}`;

let stagedEpisode = "s1e1";

export function setStagedEpisode(episode: string): void {
  if (episode.trim()) {
    stagedEpisode = episode;
  }
}

export function getStagedEpisode(): string {
  return stagedEpisode;
}

export function buildChatSessionId(characterKey: string, episode?: string): string {
  const ep = episode?.trim() || stagedEpisode;
  return `${BROWSER_SESSION}:${characterKey}:${ep}`;
}
