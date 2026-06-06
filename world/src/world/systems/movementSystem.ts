import type { CharacterState, WorldState } from "../worldState";

function integrateCharacterMovement(character: CharacterState, deltaSeconds: number): void {
  character.velocity = {
    x: character.moveIntent.x * character.movement.speed,
    y: character.moveIntent.y * character.movement.speed,
  };

  character.position.x += character.velocity.x * deltaSeconds;
  character.position.y += character.velocity.y * deltaSeconds;
}

export function movementSystem(state: WorldState, deltaMs: number): void {
  const deltaSeconds = deltaMs / 1000;

  for (const character of Object.values(state.characters)) {
    integrateCharacterMovement(character, deltaSeconds);
  }
}
