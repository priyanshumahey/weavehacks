import {
  SUPPORTED_ENSEMBLE_VERSION,
  type EnsembleReplay,
} from "./ensembleTypes";

// Every ensemble JSON under data/replays/ is bundled and keyed by file stem
// (e.g. "ensemble", "s1e1"). Vite resolves these at build time.
const REPLAY_MODULES = import.meta.glob<EnsembleReplay>(
  "../data/replays/*.json",
  { eager: true, import: "default" },
);

const DEFAULT_REPLAY = "ensemble";

/** filename stem -> bundled ensemble document. */
function replayRegistry(): Map<string, EnsembleReplay> {
  const registry = new Map<string, EnsembleReplay>();
  for (const [path, doc] of Object.entries(REPLAY_MODULES)) {
    const stem = path.split("/").pop()?.replace(/\.json$/, "") ?? "";
    if (stem) {
      registry.set(stem, doc as EnsembleReplay);
    }
  }
  return registry;
}

/** Which replay to load: `?replay=<name>` query param, else the default. */
export function requestedReplayName(): string {
  if (typeof window === "undefined") {
    return DEFAULT_REPLAY;
  }
  const params = new URLSearchParams(window.location.search);
  return params.get("replay")?.trim() || DEFAULT_REPLAY;
}

/** All available replay names (for a future picker UI). */
export function availableReplayNames(): string[] {
  return [...replayRegistry().keys()].sort();
}

function validate(doc: EnsembleReplay, name: string): EnsembleReplay {
  if (doc.version !== SUPPORTED_ENSEMBLE_VERSION) {
    console.warn(
      `[ensemble] "${name}" version ${doc.version} != supported ` +
        `${SUPPORTED_ENSEMBLE_VERSION}; attempting to play anyway.`,
    );
  }
  return doc;
}

/** Load a specific ensemble by name, falling back to the default. */
export function loadEnsemble(name: string = requestedReplayName()): EnsembleReplay {
  const registry = replayRegistry();
  const doc = registry.get(name) ?? registry.get(DEFAULT_REPLAY);
  if (!doc) {
    throw new Error(
      `[ensemble] no replay "${name}" and no default "${DEFAULT_REPLAY}" bundled`,
    );
  }
  return validate(doc, registry.has(name) ? name : DEFAULT_REPLAY);
}

/** The bundled default ensemble replay (honours `?replay=` when present). */
export function loadDefaultEnsemble(): EnsembleReplay {
  return loadEnsemble();
}
