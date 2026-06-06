import type { CharacterSpriteDefinition } from "../../types/characterSprite";
import { buildCharsetFrameSourcePath } from "../../rendering/characters/charsetFrames";

export const CHARSET_SPRITE_DEFAULTS = {
  displayHeight: 90,
  origin: {
    x: 0.5,
    y: 1,
  },
} as const satisfies Partial<CharacterSpriteDefinition>;

export interface PlayerAppearanceOption {
  id: string;
  label: string;
  characterName: string;
}

export const playerAppearanceOptions: readonly PlayerAppearanceOption[] = [
  { id: "jon-snow", label: "Jon", characterName: "jon snow" },
  { id: "ned-stark", label: "Ned", characterName: "ned stark" },
  { id: "arya-stark", label: "Arya", characterName: "arya stark" },
  { id: "sansa-stark", label: "Sansa", characterName: "sansa stark" },
  { id: "robb-stark", label: "Robb", characterName: "robb stark" },
  { id: "catelyn-stark", label: "Catelyn", characterName: "catelyn stark" },
  { id: "tyrion-lannister", label: "Tyrion", characterName: "tyrion lannister" },
  { id: "cersei-lannister", label: "Cersei", characterName: "cersei lannister" },
  { id: "jaime-lannister", label: "Jaime", characterName: "jaime lannister" },
  { id: "tywin-lannister", label: "Tywin", characterName: "tywin lannister" },
  { id: "daenerys", label: "Daenerys", characterName: "daenerys" },
  {
    id: "daenerys-targaryen",
    label: "Dany",
    characterName: "daenerys targaryen",
  },
  { id: "joffrey-baratheon", label: "Joffrey", characterName: "joffrey baratheon" },
  { id: "robert-baratheon", label: "Robert", characterName: "robert baratheon" },
  { id: "stannis-baratheon", label: "Stannis", characterName: "stannis baratheon" },
  { id: "renly-baratheon", label: "Renly", characterName: "renly baratheon" },
  { id: "sandor-clegane", label: "Sandor", characterName: "sandor clegane" },
  { id: "brienne-of-tarth", label: "Brienne", characterName: "brienne of tarth" },
  { id: "theon-greyjoy", label: "Theon", characterName: "theon greyjoy" },
  { id: "davos-seaworth", label: "Davos", characterName: "davos seaworth" },
  { id: "jorah-mormont", label: "Jorah", characterName: "jorah mormont" },
  { id: "melisandre", label: "Melisandre", characterName: "melisandre" },
  {
    id: "littlefinger-baelish",
    label: "Littlefinger",
    characterName: "littlefinger baelish",
  },
  { id: "margaery-tyrell", label: "Margaery", characterName: "margaery tyrell" },
  { id: "varys", label: "Varys", characterName: "varys" },
];

export const DEFAULT_PLAYER_APPEARANCE_ID = playerAppearanceOptions[0].id;

export function getPlayerAppearanceOption(
  appearanceId: string,
): PlayerAppearanceOption | undefined {
  return playerAppearanceOptions.find((option) => option.id === appearanceId);
}

export function buildPlayerAppearanceSpriteDefinition(
  option: PlayerAppearanceOption,
): CharacterSpriteDefinition {
  return {
    ...CHARSET_SPRITE_DEFAULTS,
    frameSourcePath: buildCharsetFrameSourcePath(option.characterName),
  };
}
