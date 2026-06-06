import type { CharacterState, PropState, WorldState } from "../worldState";
import { CHARACTER_MOVEMENT_MODES, isPropState } from "../worldState";

const EPSILON = 0.0001;

function getCollisionRadius(entity: CharacterState | PropState): number {
  if ("appearance" in entity) {
    return entity.appearance.radius;
  }

  return entity.sprite.collisionRadius;
}

function separatePair(
  first: CharacterState | PropState,
  second: CharacterState | PropState,
): void {
  const dx = first.position.x - second.position.x;
  const dy = first.position.y - second.position.y;
  const distance = Math.hypot(dx, dy);
  const minimumDistance = getCollisionRadius(first) + getCollisionRadius(second);

  if (distance >= minimumDistance) {
    return;
  }

  const overlap = minimumDistance - distance;
  const normalX = distance > EPSILON ? dx / distance : 1;
  const normalY = distance > EPSILON ? dy / distance : 0;
  const firstCanDrive =
    "movement" in first && first.movement.mode === CHARACTER_MOVEMENT_MODES.player;
  const secondCanDrive =
    "movement" in second && second.movement.mode === CHARACTER_MOVEMENT_MODES.player;

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

  if (firstCanDrive || secondCanDrive) {
    const mobileEntity = firstCanDrive ? first : second;
    mobileEntity.position.x += firstCanDrive ? normalX * overlap : -normalX * overlap;
    mobileEntity.position.y += firstCanDrive ? normalY * overlap : -normalY * overlap;
  }
}

export function collisionSystem(state: WorldState): void {
  const blockingCharacters = Object.values(state.characters).filter((character) => {
    return character.blocksMovement;
  });
  const blockingProps = Object.values(state.entities)
    .filter(isPropState)
    .filter((prop) => prop.blocksMovement);

  for (let index = 0; index < blockingCharacters.length; index += 1) {
    const character = blockingCharacters[index];

    for (let otherIndex = index + 1; otherIndex < blockingCharacters.length; otherIndex += 1) {
      separatePair(character, blockingCharacters[otherIndex]);
    }

    for (const prop of blockingProps) {
      separatePair(character, prop);
    }
  }
}
