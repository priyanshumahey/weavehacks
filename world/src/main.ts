import "./style.css";
import { createGame } from "./game/createGame";
import { loadDefaultEnsemble } from "./replay/ensembleSource";
import {
  loadEpisodeScript,
  requestedScriptName,
} from "./replay/episodeScriptSource";
import { SceneSetupPanel } from "./replay/SceneSetupPanel";
import { DebugOverlay } from "./replay/DebugOverlay";
import { REPLAY_SCENE_KEY } from "./scenes/ReplayScene";
import { EPISODE_SCENE_KEY } from "./scenes/EpisodeScene";

// Create the persistent developer stats overlay first, before the game boots,
// so the auto-started replay scene can pick it up from the shared singleton.
// Its toggle button and `-key listener are always available — even on the
// landing screen before any scene is staged.
DebugOverlay.install();

const game = createGame();

// `?script=<name>` plays a CONTINUOUS, multi-map episode script instead of the
// ensemble replay. The bundled scripts live in src/data/scripts/ (e.g.
// "handcrafted", "iter1"). When requested, boot the EpisodeScene and stop —
// the ensemble setup panel and ReplayScene are not used in this mode.
const scriptName = requestedScriptName();
if (scriptName) {
  const script = loadEpisodeScript(scriptName);
  if (script) {
    // Stop the auto-started ReplayScene, then start the EpisodeScene.
    game.scene.stop(REPLAY_SCENE_KEY);
    game.scene.start(EPISODE_SCENE_KEY, { script });
  } else {
    console.error(
      `[script] no bundled episode-script "${scriptName}". ` +
        "Place it under world/src/data/scripts/<name>.json",
    );
  }
} else {
  bootEnsembleMode();
}

function bootEnsembleMode(): void {
  // A persistent scene-setup overlay (outside the Phaser scene lifecycle, so it
  // survives restarts). Staging a scene restarts the replay scene with the fresh
  // ensemble; map location is applied client-side from the setup panel.
  const setupPanel = new SceneSetupPanel();
  setupPanel.seedEnsemble(loadDefaultEnsemble());
  setupPanel.setOnStage((ensemble) => {
    const replayScene = game.scene.getScene(REPLAY_SCENE_KEY);
    if (replayScene) {
      replayScene.scene.restart({ replay: ensemble });
    } else {
      game.scene.start(REPLAY_SCENE_KEY, { replay: ensemble });
    }
  });
}
