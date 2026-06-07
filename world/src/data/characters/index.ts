import aryaStark from "./arya-stark.json";
import branStark from "./bran-stark.json";
import catelynStark from "./catelyn-stark.json";
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
  catelynStark,
  branStark,
  cerseiLannister,
] as CharacterDefinition[];
