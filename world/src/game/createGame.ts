import Phaser from "phaser";
import { createGameConfig } from "./config";

export function createGame(): Phaser.Game {
  return new Phaser.Game(createGameConfig());
}
