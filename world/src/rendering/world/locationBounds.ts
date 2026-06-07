import { winterfellWorldLayout } from "../../data/locations/winterfellWorldLayout";
import type { LocationDefinition, WorldLayoutDefinition } from "../../types/location";
import type { WorldBounds } from "../../world/worldState";
import { WORLD_PLAYFIELD_MARGIN } from "./worldDimensions";

export function getLocationBounds(
  location: LocationDefinition,
  margin = WORLD_PLAYFIELD_MARGIN,
): WorldBounds {
  return {
    minX: location.offset.x + margin,
    minY: location.offset.y + margin,
    maxX: location.offset.x + location.map.width - margin,
    maxY: location.offset.y + location.map.height - margin,
  };
}

export function computeWorldSize(
  layout: WorldLayoutDefinition = winterfellWorldLayout,
): { width: number; height: number } {
  let width = 0;
  let height = 0;

  for (const location of layout.locations) {
    width = Math.max(width, location.offset.x + location.map.width);
    height = Math.max(height, location.offset.y + location.map.height);
  }

  return { width, height };
}
