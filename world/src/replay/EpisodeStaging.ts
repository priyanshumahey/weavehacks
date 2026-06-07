// EpisodeStaging — stages a whole multi-act episode for in-place playback.
//
// A single-act replay stages its groups and plays them on one clock. A
// multi-act episode (``replay.acts``) instead plays its acts *in sequence*, and
// the cast must persist across acts so it reads as movement — when Act II
// re-forms the groups, a character who was huddled with one rival walks across
// the room to confront another, two who spoke apart converge, a pair splits.
//
// To get that, every character is spawned ONCE (the union of all acts' casts),
// and each act provides its own layout (huddle centres + ring homes). Switching
// acts re-points the movement system at the next act's homes; the existing
// walk-to-home logic does the rest. This module computes both: the union of
// character definitions for world creation, and the per-act staging.

import { buildEnsembleStaging, type EnsembleStaging } from "./EnsembleStaging";
import type {
  EnsembleAct,
  EnsembleGroup,
  EnsembleReplay,
} from "./ensembleTypes";
import type { CharacterDefinition } from "../types/character";

interface StagingOptions {
  localizeToLocationId?: string;
}

/** One act, fully staged: its groups plus the layout the movement system uses. */
export interface ActStaging {
  id: string;
  title: string;
  groups: EnsembleGroup[];
  /** Full per-act staging (definitions for this act, layouts, membership). */
  staging: EnsembleStaging;
}

export interface EpisodeStaging {
  /** Every character across every act, spawned exactly once (world creation). */
  definitions: CharacterDefinition[];
  acts: ActStaging[];
}

/** The acts of a replay, treating a single-act replay as one implicit act. */
export function actsOf(replay: EnsembleReplay): EnsembleAct[] {
  if (replay.acts && replay.acts.length > 0) {
    return replay.acts;
  }
  return [{ id: "act-0", title: replay.title || "Scene", groups: replay.groups }];
}

/** True when the replay is a multi-act episode (more than one act). */
export function isMultiAct(replay: EnsembleReplay): boolean {
  return !!replay.acts && replay.acts.length > 1;
}

export function buildEpisodeStaging(
  replay: EnsembleReplay,
  options?: StagingOptions,
): EpisodeStaging {
  const acts = actsOf(replay);

  const actStagings: ActStaging[] = acts.map((act) => ({
    id: act.id,
    title: act.title,
    groups: act.groups,
    // Reuse the single-scene stager per act by wrapping the act's groups in a
    // minimal replay; it computes that act's huddle centres, ring homes and
    // entrance spawns.
    staging: buildEnsembleStaging(
      { version: replay.version, title: act.title, groups: act.groups },
      options,
    ),
  }));

  // Union of character definitions: each character spawns once, at the first
  // act in which it appears (so it walks in there, then moves between acts).
  const definitions: CharacterDefinition[] = [];
  const seen = new Set<string>();
  for (const act of actStagings) {
    for (const def of act.staging.definitions) {
      if (seen.has(def.id)) {
        continue;
      }
      seen.add(def.id);
      definitions.push(def);
    }
  }

  return { definitions, acts: actStagings };
}
