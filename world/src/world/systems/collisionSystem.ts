import type { CharacterState, WorldState } from "../worldState";
import { CHARACTER_MOVEMENT_MODES } from "../worldState";

const EPSILON = 0.0001;

function separatePair(first: CharacterState, second: CharacterState): void {
  const dx = first.position.x - second.position.x;
  const dy = first.position.y - second.position.y;
  const distance = Math.hypot(dx, dy);
  const minimumDistance = first.appearance.radius + second.appearance.radius;

  if (distance >= minimumDistance) {
    return;
  }

  const overlap = minimumDistance - distance;
  const normalX = distance > EPSILON ? dx / distance : 1;
  const normalY = distance > EPSILON ? dy / distance : 0;
  const firstCanDrive = first.movement.mode === CHARACTER_MOVEMENT_MODES.player;
  const secondCanDrive = second.movement.mode === CHARACTER_MOVEMENT_MODES.player;

  if (firstCanDrive && !secondCanDrive) {
    first.position.x += normalX * overlap;
    first.position.y += normalY * overlap;
    return;
  }

  if (!firstCanDrive && secondCanDrive) {
    second.position.x -= normalX * overlap;
    second.position.y -= normalY * overlap;
    return;
  }

  const sharedOffset = overlap / 2;

  first.position.x += normalX * sharedOffset;
  first.position.y += normalY * sharedOffset;
  second.position.x -= normalX * sharedOffset;
  second.position.y -= normalY * sharedOffset;
}

export function collisionSystem(state: WorldState): void {
  const blockingCharacters = Object.values(state.characters).filter((character) => {
    return character.blocksMovement;
  });

  for (let index = 0; index < blockingCharacters.length; index += 1) {
    const character = blockingCharacters[index];

    for (let otherIndex = index + 1; otherIndex < blockingCharacters.length; otherIndex += 1) {
      separatePair(character, blockingCharacters[otherIndex]);
    }
  }
}
