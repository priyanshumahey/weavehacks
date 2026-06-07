import ensembleJson from "../data/replays/ensemble.json";
import {
  SUPPORTED_ENSEMBLE_VERSION,
  type EnsembleReplay,
} from "./ensembleTypes";

/** The bundled default ensemble replay. */
export function loadDefaultEnsemble(): EnsembleReplay {
  const doc = ensembleJson as unknown as EnsembleReplay;
  if (doc.version !== SUPPORTED_ENSEMBLE_VERSION) {
    console.warn(
      `[ensemble] document version ${doc.version} != supported ` +
        `${SUPPORTED_ENSEMBLE_VERSION}; attempting to play anyway.`,
    );
  }
  return doc;
}
