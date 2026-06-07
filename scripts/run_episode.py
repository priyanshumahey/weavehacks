"""Step 4 — run a full episode offline, write a chronicle, score it, replay it.

    uv run python scripts/run_episode.py s1e1            # run + chronicle + score
    uv run python scripts/run_episode.py s1e1 --no-score # skip the fidelity judge
    uv run python scripts/run_episode.py --replay logs/episodes/<file>.json

This is the offline batch (§0 #6): build the complete chronicle first, then
score and replay the artifact. Needs Redis up and OPENAI_API_KEY for a live run;
``--replay`` is pure file reading (no infra).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from got_agents.infra import init_weave
from got_agents.orchestration import load_skeleton, run_episode
from got_agents.outputs import (
    episode_to_dict,
    render_episode,
    replay_chronicle,
    score_episode_fidelity,
    write_ensemble,
    write_episode,
    write_replay,
)

# The Phaser world imports replay JSON from here (Vite resolves the import).
_WORLD_REPLAY_DIR = Path(__file__).resolve().parents[1] / "world" / "src" / "data" / "replays"


def _run(point: str, *, score: bool) -> None:
    init_weave()
    skeleton = load_skeleton(point)
    print(f"Running episode {skeleton.episode}: {skeleton.title} "
          f"({len(skeleton.beats)} beats)…\n")

    result = run_episode(skeleton)
    record = episode_to_dict(result)

    json_path, txt_path = write_episode(result)
    print(render_episode(record))
    print(f"chronicle -> {txt_path}")
    print(f"             {json_path}")

    # Replay contract for the Phaser world (both logs/ and the world data dir).
    replay_path = write_replay(record)
    world_path = write_replay(record, root=_WORLD_REPLAY_DIR)
    print(f"replay    -> {replay_path}")
    print(f"             {world_path}")

    # Ensemble contract — the *living world* shape ReplayScene plays (one group
    # per scene, pinned to the map). Written to the same world data dir.
    ensemble_path = write_ensemble(record)
    world_ensemble = write_ensemble(record, root=_WORLD_REPLAY_DIR)
    print(f"ensemble  -> {ensemble_path}")
    print(f"             {world_ensemble}")

    if score:
        fidelity = score_episode_fidelity(record)
        print("\n--- character fidelity ---")
        for c in fidelity.characters:
            flag = "  [VIOLATION]" if c.violation else ""
            print(f"  {c.speaker}: {c.score:.2f}{flag}  — {c.rationale}")
        print(f"  episode mean: {fidelity.mean:.2f}")


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="run_episode")
    parser.add_argument("point", nargs="?", help="story point with a skeleton, e.g. s1e1")
    parser.add_argument("--no-score", action="store_true", help="skip fidelity scoring")
    parser.add_argument("--replay", metavar="PATH", help="render a saved chronicle JSON")
    args = parser.parse_args(argv[1:])

    if args.replay:
        print(replay_chronicle(args.replay))
        return
    if not args.point:
        parser.error("provide a story point (e.g. s1e1) or --replay PATH")
    _run(args.point, score=not args.no_score)


if __name__ == "__main__":
    main(sys.argv)
