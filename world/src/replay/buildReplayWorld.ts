// Builds the replay's cast into world CharacterDefinitions: each cast member
// becomes an `npc`/`script` character backed by its charset frame directory,
// arranged in a loose ring near the centre of the playfield. Positions are
// deterministic (index-based) so a replay always lays out the same way.

import type { CharacterDefinition, WorldBounds } from "../types/character";
import {
  CHARACTER_CONTROLLER_TYPES,
  CHARACTER_KINDS,
  CHARACTER_MOVEMENT_MODES,
} from "../world/worldState";
import type { ReplayCastMember } from "./replayTypes";

const STAGE_RADIUS = 96; // tight spawn ring (px) near the playfield centre
const DISPLAY_HEIGHT = 75;
const WANDER_SPEED = 52; // gentle ambient stroll (px/s), calmer than the player's 180

function ringPosition(
  index: number,
  count: number,
  bounds: WorldBounds,
): { x: number; y: number } {
  const centreX = (bounds.minX + bounds.maxX) / 2;
  const centreY = (bounds.minY + bounds.maxY) / 2;

  if (count <= 1) {
    return { x: centreX, y: centreY };
  }

  // Start at the top and go clockwise; offset so faces read toward centre.
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return {
    x: centreX + Math.cos(angle) * STAGE_RADIUS,
    y: centreY + Math.sin(angle) * STAGE_RADIUS,
  };
}

export function buildReplayCharacterDefinitions(
  cast: ReplayCastMember[],
  bounds: WorldBounds,
): CharacterDefinition[] {
  return cast.map((member, index) => {
    const position = ringPosition(index, cast.length, bounds);

    return {
      id: member.key,
      name: member.name,
      kind: CHARACTER_KINDS.npc,
      controller: CHARACTER_CONTROLLER_TYPES.script,
      position,
      movement: {
        mode: CHARACTER_MOVEMENT_MODES.idle,
        speed: WANDER_SPEED,
      },
      sprite: {
        frameSourcePath: `charsets/sprites/${member.charset}`,
        displayHeight: DISPLAY_HEIGHT,
        origin: { x: 0.5, y: 1 },
        labelOffset: { x: 0, y: 0 },
      },
      traits: [],
      tags: ["replay"],
    } satisfies CharacterDefinition;
  });
}
