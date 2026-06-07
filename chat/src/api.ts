// API client for the FastAPI chat backend (proxied at /api in dev).

export interface DriveTop {
  name: string;
  value: number;
}

export interface Character {
  key: string;
  name: string;
  title: string;
  persona: string;
  lifeMotive: string;
  charset: string;
  topDrives: DriveTop[];
}

export interface Episode {
  id: string;
  label: string;
}

export interface RecalledMemory {
  text: string;
  importance: number;
  concepts: string[];
}

export interface ChatResponse {
  character: { key: string; name: string };
  episode: string;
  reply: string;
  drives: { felt: string; top: DriveTop[] };
  recalledMemories: RecalledMemory[];
  memoryCount: number;
}

export interface InnerState {
  felt: string;
  drives: DriveTop[];
  recalledMemories: RecalledMemory[];
  memoryCount: number;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCharacters(): Promise<Character[]> {
  const data = await getJson<{ characters: Character[] }>("/api/characters");
  return data.characters;
}

export async function fetchEpisodes(): Promise<Episode[]> {
  const data = await getJson<{ episodes: Episode[] }>("/api/episodes");
  return data.episodes;
}

export async function sendChat(params: {
  character: string;
  message: string;
  episode: string;
  sessionId: string;
}): Promise<ChatResponse> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      character: params.character,
      message: params.message,
      episode: params.episode,
      session_id: params.sessionId,
    }),
  });
  if (!res.ok) {
    throw new Error(`chat failed: ${res.status}`);
  }
  return res.json() as Promise<ChatResponse>;
}

/** Portrait URL for a character (served from /portraits/<charset>.png). */
export function portraitUrl(charset: string): string {
  return `/portraits/${encodeURIComponent(charset)}.png`;
}

/** The character's inner state for the current session (stashed by /api/prepare). */
export async function fetchInnerState(
  sessionId: string,
): Promise<InnerState | null> {
  const res = await fetch(`/api/inner-state/${encodeURIComponent(sessionId)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { state: InnerState | null };
  return data.state ?? null;
}
