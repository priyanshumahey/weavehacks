export interface CharacterOption {
  key: string;
  name: string;
  title: string;
}

export interface EpisodeOption {
  id: string;
  label: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} -> ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCharacters(): Promise<CharacterOption[]> {
  const data = await getJson<{ characters: CharacterOption[] }>("/api/characters");
  return data.characters;
}

export async function fetchEpisodes(): Promise<EpisodeOption[]> {
  const data = await getJson<{ episodes: EpisodeOption[] }>("/api/episodes");
  return data.episodes;
}
