import innkeeper from "./innkeeper.json";
import player from "./player.json";
import scout from "./scout.json";
import type { CharacterDefinition } from "../../types/character";

export const characterDefinitions = [
  player,
  innkeeper,
  scout,
] as CharacterDefinition[];
