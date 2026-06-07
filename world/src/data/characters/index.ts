import aryaStark from "./arya-stark.json";
import cerseiLannister from "./cersei-lannister.json";
import nedStark from "./ned-stark.json";
import player from "./player.json";
import tyrionLannister from "./tyrion-lannister.json";
import type { CharacterDefinition } from "../../types/character";

export const characterDefinitions = [
  player,
  tyrionLannister,
  aryaStark,
  nedStark,
  cerseiLannister,
] as CharacterDefinition[];
