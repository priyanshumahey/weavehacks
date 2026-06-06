import type { WorldState } from "../worldState";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function boundsSystem(state: WorldState): void {
  const { bounds } = state;

  for (const character of Object.values(state.characters)) {
    const radius = character.appearance.radius;

    character.position.x = clamp(
      character.position.x,
      bounds.minX + radius,
      bounds.maxX - radius,
    );
    character.position.y = clamp(
      character.position.y,
      bounds.minY + radius,
      bounds.maxY - radius,
    );
  }
}
