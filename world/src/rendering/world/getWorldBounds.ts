import type { WorldBounds } from "../../world/worldState";
import {
  WORLD_HEIGHT,
  WORLD_PLAYFIELD_MARGIN,
  WORLD_WIDTH,
} from "./worldDimensions";

export function getWorldBounds(): WorldBounds {
  const margin = WORLD_PLAYFIELD_MARGIN;

  return {
    minX: margin,
    minY: margin,
    maxX: WORLD_WIDTH - margin,
    maxY: WORLD_HEIGHT - margin,
  };
}
