// Scene API — the thin client between the Phaser world and the FastAPI scene
// backend. Stages live council scenes and returns the ensemble the world plays.

import type { EnsembleReplay } from "./ensembleTypes";

export interface RosterDrive {
  name: string;
  value: number;
}

export interface RosterCharacter {
  key: string;
  name: string;
  title: string;
  charset: string;
  topDrives: RosterDrive[];
}

export interface SceneOption {
  id: string;
  label: string;
}

export interface SceneOptions {
  episodes: SceneOption[];
  locations: SceneOption[];
  minCast: number;
  maxCast: number;
}

export interface SceneRosterResponse {
  roster: RosterCharacter[];
  options: SceneOptions;
}

export interface SceneRequest {
  cast: string[];
  setting: string;
  stakes: string;
  episode: string;
  location: string;
  maxRounds: number;
}

export interface EpisodeRequest {
  premise: string;
  castPool: string[];
  episode: string;
  location: string;
  maxGroups: number;
  maxRounds: number;
}

export interface SavedScene {
  name: string;
  title: string;
  premise: string;
  episode: string;
  location: string;
  kind: string;
  createdAt: number;
  groupCount: number;
  cast: string[];
}

const API_BASE = "/api";

async function asJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body?.detail) {
        detail = body.detail;
      }
    } catch {
      // non-JSON error body; keep the status text
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

/** Fetch the spawnable roster and the setup options (episodes, locations). */
export async function fetchSceneRoster(): Promise<SceneRosterResponse> {
  const response = await fetch(`${API_BASE}/scene/roster`);
  return asJson<SceneRosterResponse>(response);
}

/** Stage a live scene; resolves to the ensemble the world can play. */
export async function stageScene(request: SceneRequest): Promise<EnsembleReplay> {
  const response = await fetch(`${API_BASE}/scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cast: request.cast,
      setting: request.setting,
      stakes: request.stakes,
      episode: request.episode,
      location: request.location,
      max_rounds: request.maxRounds,
    }),
  });
  const payload = await asJson<{ ensemble: EnsembleReplay }>(response);
  return payload.ensemble;
}

/** Direct a whole moment from one premise — the AI decomposes it into
 *  several concurrent conversations. Resolves to the multi-group ensemble. */
export async function directEpisode(request: EpisodeRequest): Promise<EnsembleReplay> {
  const response = await fetch(`${API_BASE}/episode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      premise: request.premise,
      cast_pool: request.castPool,
      episode: request.episode,
      location: request.location,
      max_groups: request.maxGroups,
      max_rounds: request.maxRounds,
    }),
  });
  const payload = await asJson<{ ensemble: EnsembleReplay }>(response);
  return payload.ensemble;
}

/** List previously saved scenes (newest first). */
export async function fetchSavedScenes(): Promise<SavedScene[]> {
  const response = await fetch(`${API_BASE}/scenes`);
  const payload = await asJson<{ scenes: SavedScene[] }>(response);
  return payload.scenes;
}

/** Load a saved scene's ensemble by name. */
export async function loadSavedScene(name: string): Promise<EnsembleReplay> {
  const response = await fetch(`${API_BASE}/scenes/${encodeURIComponent(name)}`);
  const payload = await asJson<{ ensemble: EnsembleReplay }>(response);
  return payload.ensemble;
}
