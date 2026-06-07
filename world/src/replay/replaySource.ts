// Replay source loading. The Python `run_episode.py` writes the replay contract
// to `src/data/replays/<episode>.json`; Vite resolves the JSON import at build.

import replayJson from "../data/replays/s1e1.json";
import {
  SUPPORTED_REPLAY_VERSION,
  type ReplayDocument,
} from "./replayTypes";

/** The bundled default replay (S1E1). */
export function loadDefaultReplay(): ReplayDocument {
  const doc = replayJson as unknown as ReplayDocument;

  if (doc.version !== SUPPORTED_REPLAY_VERSION) {
    // Non-fatal: log and proceed; fields are additive across versions.
    console.warn(
      `[replay] document version ${doc.version} != supported ` +
        `${SUPPORTED_REPLAY_VERSION}; attempting to play anyway.`,
    );
  }

  return doc;
}
