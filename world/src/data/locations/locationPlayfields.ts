import { LOCATION_IDS, type LocationId } from "../../types/location";
import type { MapBackgroundDefinition } from "../../types/terrain";
import type { WorldBounds } from "../../world/worldState";

/** Normalized walkable rectangle within a map image (0..1). */
export interface NormalizedPlayfield {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Authored playfield overrides for maps whose walkable area is smaller than the
 * full image. Values are traced from the map art (see wall.png walkway band).
 */
const LOCATION_PLAYFIELDS: Partial<Record<LocationId, NormalizedPlayfield>> = {
  [LOCATION_IDS.wall]: {
    minX: 0.078,
    minY: 0.21,
    maxX: 0.922,
    maxY: 0.523,
  },
};

export function getLocationPlayfieldOverride(
  locationId: LocationId,
): NormalizedPlayfield | undefined {
  return LOCATION_PLAYFIELDS[locationId];
}

/** Traced playfields already hug the art; a full playfield margin would erase them. */
const TRACED_PLAYFIELD_MARGIN_CAP = 36;

export function resolvePlayfieldBounds(
  map: MapBackgroundDefinition,
  locationId: LocationId,
  margin: number,
): WorldBounds | null {
  const playfield = getLocationPlayfieldOverride(locationId);
  if (!playfield) {
    return null;
  }

  const inset = Math.min(margin, TRACED_PLAYFIELD_MARGIN_CAP);

  return {
    minX: playfield.minX * map.width + inset,
    minY: playfield.minY * map.height + inset,
    maxX: playfield.maxX * map.width - inset,
    maxY: playfield.maxY * map.height - inset,
  };
}
