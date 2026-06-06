import type Phaser from "phaser";
import { buildCharsetFrameSourcePath } from "./charsetFrames";
import { playerAppearanceOptions } from "../../data/characters/playerAppearances";
import {
  collectCharsetFrameTextureKeysFromPaths,
  preloadCharsetFrames,
} from "./preloadCharsetFrames";

export function collectPlayerAppearanceTextureKeys(): Set<string> {
  const frameSourcePaths = playerAppearanceOptions.map((option) =>
    buildCharsetFrameSourcePath(option.characterName),
  );

  return collectCharsetFrameTextureKeysFromPaths(frameSourcePaths);
}

export function preloadPlayerAppearances(scene: Phaser.Scene): void {
  const frameSourcePaths = playerAppearanceOptions.map((option) =>
    buildCharsetFrameSourcePath(option.characterName),
  );

  preloadCharsetFrames(scene, frameSourcePaths);
}
