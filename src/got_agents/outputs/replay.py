"""Replay (L5) — read a saved chronicle artifact and render it back.

The third phase of the offline pipeline (§0 #6): the simulation already wrote a
complete chronicle; replay only *reads* it. This closes the loop — proving a run
is fully reconstructable from its artifact with no agents, no world, no LLM.
"""

from __future__ import annotations

import json
from pathlib import Path

from got_agents.outputs.episode_chronicle import render_text


def load_chronicle(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())


def replay_chronicle(path: str | Path) -> str:
    """Render a saved chronicle JSON back to a readable transcript."""
    return render_text(load_chronicle(path))
