export const RENDER_LAYERS = {
  terrain: 0,
  worldBase: 1,
  uiOverlay: 10_000,
} as const;

export const RENDER_DEPTH_PRIORITY = {
  prop: 0,
  character: 0.001,
} as const;

export function resolveWorldRenderDepth(
  sortY: number,
  priorityOffset: number,
): number {
  return RENDER_LAYERS.worldBase + sortY + priorityOffset;
}

export function resolveCharacterSortY(
  positionY: number,
  displayHeight: number,
): number {
  return positionY + displayHeight * 0.5;
}

export function resolvePropSortY(
  positionY: number,
  displayHeight: number,
  originY: number,
): number {
  return positionY + displayHeight * (1 - originY);
}

export function resolveTextureDisplayHeight(
  textureHeight: number,
  scale: number,
): number {
  return textureHeight * scale;
}
