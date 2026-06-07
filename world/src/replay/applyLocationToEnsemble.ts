import { getLocationById, winterfellWorldLayout } from "../data/locations/winterfellWorldLayout";
import type { LocationId } from "../types/location";
import type { EnsembleReplay } from "./ensembleTypes";

/** The map every group in this replay plays on (they share one scene location). */
export function resolveEnsembleLocationId(replay: EnsembleReplay): LocationId {
  const fromGroup = replay.groups[0]?.locationId;
  if (fromGroup && getLocationById(fromGroup)) {
    return fromGroup as LocationId;
  }
  return winterfellWorldLayout.defaultLocationId;
}

/** Stamp every group with the viewer's chosen map before staging in the world. */
export function applyLocationToEnsemble(
  replay: EnsembleReplay,
  locationId: string,
): EnsembleReplay {
  const resolved =
    getLocationById(locationId)?.id ?? winterfellWorldLayout.defaultLocationId;

  return {
    ...replay,
    groups: replay.groups.map((group) => ({
      ...group,
      locationId: resolved,
    })),
  };
}
