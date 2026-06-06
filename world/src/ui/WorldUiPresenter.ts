import {
  getCharacterPortraitUrl,
  resolvePortraitNameFromFrameSourcePath,
} from "../assets/characterPortraitRegistry";
import type { WorldState } from "../world/worldState";
import { playerAppearanceOptions } from "../data/characters/playerAppearances";

export interface PlayerAppearanceOptionViewModel {
  id: string;
  label: string;
  selected: boolean;
}

export interface DialogueViewModel {
  name: string;
  subtitle: string | null;
  body: string;
  portraitUrl: string | null;
}

export interface WorldUiViewModel {
  promptText: string | null;
  dialogue: DialogueViewModel | null;
  inspectionTitle: string | null;
  inspectionLines: string[];
  playerAppearanceOptions: PlayerAppearanceOptionViewModel[];
  playerAppearanceScrollOffset: number;
  playerAppearanceVisibleCount: number;
  canScrollPlayerAppearanceBack: boolean;
  canScrollPlayerAppearanceForward: boolean;
}

const DIALOGUE_COPY: Record<string, string> = {
  tyrion_intro:
    "Wine, wit, and wary guests. I drink and I know things — especially about strangers.",
  arya_intro:
    "Quiet roads don't stay quiet. Stick to the shadows if you want to keep your head.",
};

function getCharacter(state: WorldState, entityId: string | null) {
  if (!entityId) {
    return null;
  }

  return state.characters[entityId] ?? null;
}

function getDialogueBody(character: ReturnType<typeof getCharacter>, dialogueId: string | null): string | null {
  if (!character || !dialogueId) {
    return null;
  }

  return DIALOGUE_COPY[dialogueId] ?? `${character.name} has nothing to say right now.`;
}

function formatDialogueSubtitle(traits: string[]): string | null {
  if (traits.length === 0) {
    return null;
  }

  return traits.map((trait) => trait.toUpperCase()).join(" · ");
}

function buildDialogueViewModel(
  character: ReturnType<typeof getCharacter>,
  dialogueId: string | null,
): DialogueViewModel | null {
  if (!character || !dialogueId) {
    return null;
  }

  const body = getDialogueBody(character, dialogueId);

  if (!body) {
    return null;
  }

  const portraitName = resolvePortraitNameFromFrameSourcePath(character.sprite.frameSourcePath);

  return {
    name: character.name,
    subtitle: formatDialogueSubtitle(character.traits),
    body,
    portraitUrl: portraitName ? getCharacterPortraitUrl(portraitName) : null,
  };
}

export function buildWorldUiViewModel(
  state: WorldState,
  playerAppearanceScrollOffset: number,
  playerAppearanceVisibleCount: number,
): WorldUiViewModel {
  const dialogueCharacter = getCharacter(state, state.ui.dialogue?.entityId ?? null);
  const inspectionCharacter = getCharacter(state, state.ui.inspection?.entityId ?? null);
  const maxScrollOffset = Math.max(
    0,
    playerAppearanceOptions.length - playerAppearanceVisibleCount,
  );
  const clampedScrollOffset = Math.min(
    Math.max(playerAppearanceScrollOffset, 0),
    maxScrollOffset,
  );

  return {
    promptText: state.ui.prompt?.text ?? null,
    dialogue:
      state.ui.dialogue?.visible
        ? buildDialogueViewModel(dialogueCharacter, state.ui.dialogue.dialogueId)
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
    playerAppearanceOptions: playerAppearanceOptions.map((option) => ({
      id: option.id,
      label: option.label,
      selected: option.id === state.ui.playerAppearanceId,
    })),
    playerAppearanceScrollOffset: clampedScrollOffset,
    playerAppearanceVisibleCount,
    canScrollPlayerAppearanceBack: clampedScrollOffset > 0,
    canScrollPlayerAppearanceForward: clampedScrollOffset < maxScrollOffset,
  };
}
