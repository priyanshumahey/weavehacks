import { computeWorldSize } from "./locationBounds";

const worldSize = computeWorldSize();

export const WORLD_WIDTH = worldSize.width;
export const WORLD_HEIGHT = worldSize.height;
export const WORLD_PLAYFIELD_MARGIN = 100;
