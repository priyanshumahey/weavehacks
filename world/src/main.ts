import "./style.css";
import { createGame } from "./game/createGame";
import { SceneSetupPanel } from "./replay/SceneSetupPanel";
import { REPLAY_SCENE_KEY } from "./scenes/ReplayScene";

const game = createGame();

// A persistent scene-setup overlay (outside the Phaser scene lifecycle, so it
// survives restarts). Staging a scene restarts the replay scene with the fresh
// ensemble the backend returns.
const setupPanel = new SceneSetupPanel();
setupPanel.setOnStage((ensemble) => {
  const replayScene = game.scene.getScene(REPLAY_SCENE_KEY);
  if (replayScene) {
    replayScene.scene.restart({ replay: ensemble });
  } else {
    game.scene.start(REPLAY_SCENE_KEY, { replay: ensemble });
  }
});
