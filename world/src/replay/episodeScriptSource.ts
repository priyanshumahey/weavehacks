// episodeScriptSource — bundles every episode-script under data/scripts/ and
// resolves which one to play. Mirrors ensembleSource: each JSON is keyed by file
// stem (e.g. "handcrafted", "iter1") and Vite resolves them at build time.
//
// Pick one with the `?script=<name>` query param. When present, the world boots
// the continuous EpisodeScene instead of the ensemble ReplayScene.

import { EPISODE_SCRIPT_VERSION, type EpisodeScript } from "./episodeScriptTypes";

const SCRIPT_MODULES = import.meta.glob<EpisodeScript>(
  "../data/scripts/*.json",
  { eager: true, import: "default" },
);

/** filename stem -> bundled episode-script document. */
function scriptRegistry(): Map<string, EpisodeScript> {
  const registry = new Map<string, EpisodeScript>();
  for (const [path, doc] of Object.entries(SCRIPT_MODULES)) {
    const stem = path.split("/").pop()?.replace(/\.json$/, "") ?? "";
    if (stem) {
      registry.set(stem, doc as EpisodeScript);
    }
  }
  return registry;
}

/** All bundled episode-script names (for a picker UI). */
export function availableScriptNames(): string[] {
  return [...scriptRegistry().keys()].sort();
}

/** The `?script=<name>` query param, or null when not requested. */
export function requestedScriptName(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = new URLSearchParams(window.location.search).get("script");
  return value?.trim() || null;
}

/** Load a bundled episode-script by name, or null if absent. */
export function loadEpisodeScript(name: string): EpisodeScript | null {
  const doc = scriptRegistry().get(name);
  if (!doc) {
    return null;
  }
  if (doc.version !== EPISODE_SCRIPT_VERSION) {
    console.warn(
      `[script] "${name}" version ${doc.version} != supported ` +
        `${EPISODE_SCRIPT_VERSION}; attempting to play anyway.`,
    );
  }
  return doc;
}
