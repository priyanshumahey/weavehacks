import type { Vector2, WorldBounds } from "../worldState";

export const STUCK_MOVEMENT_TIMEOUT_MS = 3000;
export const STUCK_MOVEMENT_EPSILON = 5;

const MOVEMENT_INTENT_EPSILON = 0.01;

export interface StuckMovementTracker {
  anchorX: number;
  anchorY: number;
  stuckMs: number;
  blockedHeadingX: number;
  blockedHeadingY: number;
}

export function createStuckMovementTracker(position: Vector2): StuckMovementTracker {
  return {
    anchorX: position.x,
    anchorY: position.y,
    stuckMs: 0,
    blockedHeadingX: 0,
    blockedHeadingY: 0,
  };
}

export function resetStuckMovementTracker(
  tracker: StuckMovementTracker,
  position: Vector2,
): void {
  tracker.anchorX = position.x;
  tracker.anchorY = position.y;
  tracker.stuckMs = 0;
  tracker.blockedHeadingX = 0;
  tracker.blockedHeadingY = 0;
}

/**
 * Advance stuck tracking for a character that is trying to move. Returns true
 * once the body has barely drifted for STUCK_MOVEMENT_TIMEOUT_MS.
 */
export function advanceStuckMovement(
  tracker: StuckMovementTracker,
  position: Vector2,
  moveIntent: Vector2,
  deltaMs: number,
): boolean {
  const tryingToMove = Math.hypot(moveIntent.x, moveIntent.y) > MOVEMENT_INTENT_EPSILON;

  if (!tryingToMove) {
    resetStuckMovementTracker(tracker, position);
    return false;
  }

  const drift = Math.hypot(position.x - tracker.anchorX, position.y - tracker.anchorY);

  if (drift >= STUCK_MOVEMENT_EPSILON) {
    tracker.anchorX = position.x;
    tracker.anchorY = position.y;
    tracker.stuckMs = 0;
  } else {
    tracker.stuckMs += deltaMs;
  }

  const headingMag = Math.hypot(moveIntent.x, moveIntent.y);
  if (headingMag > MOVEMENT_INTENT_EPSILON) {
    tracker.blockedHeadingX = moveIntent.x / headingMag;
    tracker.blockedHeadingY = moveIntent.y / headingMag;
  }

  return tracker.stuckMs >= STUCK_MOVEMENT_TIMEOUT_MS;
}

/** A point turned ~90° away from the blocked heading, clamped inside bounds. */
export function pickEscapePoint(
  from: Vector2,
  blockedHeading: Vector2,
  bounds: WorldBounds,
  travel: number,
): Vector2 {
  const headingMag = Math.hypot(blockedHeading.x, blockedHeading.y);
  const baseAngle =
    headingMag > MOVEMENT_INTENT_EPSILON
      ? Math.atan2(blockedHeading.y / headingMag, blockedHeading.x / headingMag)
      : Math.random() * Math.PI * 2;
  const turn =
    (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + (Math.random() * 0.6 - 0.3));
  const angle = baseAngle + turn;

  return {
    x: clamp(from.x + Math.cos(angle) * travel, bounds.minX, bounds.maxX),
    y: clamp(from.y + Math.sin(angle) * travel, bounds.minY, bounds.maxY),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
