import type { CharacterState, WorldState } from "../world/worldState";

export interface WorldUiViewModel {
  promptText: string | null;
  dialogueTitle: string | null;
  dialogueBody: string | null;
  inspectionTitle: string | null;
  inspectionLines: string[];
}

const DIALOGUE_COPY: Record<string, string> = {
  innkeeper_intro: "Fresh stew, warm gossip, and a guarded eye on every stranger.",
  scout_intro: "The roads are quiet for now, but quiet roads rarely stay that way.",
};

function getCharacter(state: WorldState, entityId: string | null): CharacterState | null {
  if (!entityId) {
    return null;
  }

  return state.characters[entityId] ?? null;
}

function getDialogueBody(character: CharacterState | null, dialogueId: string | null): string | null {
  if (!character || !dialogueId) {
    return null;
  }

  return DIALOGUE_COPY[dialogueId] ?? `${character.name} has nothing to say right now.`;
}

export function buildWorldUiViewModel(state: WorldState): WorldUiViewModel {
  const dialogueCharacter = getCharacter(state, state.ui.dialogue?.entityId ?? null);
  const inspectionCharacter = getCharacter(state, state.ui.inspection?.entityId ?? null);

  return {
    promptText: state.ui.prompt?.text ?? null,
    dialogueTitle:
      state.ui.dialogue?.visible && dialogueCharacter ? dialogueCharacter.name : null,
    dialogueBody: state.ui.dialogue?.visible
      ? getDialogueBody(dialogueCharacter, state.ui.dialogue.dialogueId)
      : null,
    inspectionTitle:
      state.ui.inspection?.visible && inspectionCharacter
        ? `Inspect: ${inspectionCharacter.name}`
        : null,
    inspectionLines:
      state.ui.inspection?.visible && inspectionCharacter
        ? [
            `Traits: ${inspectionCharacter.traits.join(", ") || "unknown"}`,
            `Position: ${Math.round(inspectionCharacter.position.x)}, ${Math.round(
              inspectionCharacter.position.y,
            )}`,
          ]
        : [],
  };
}
