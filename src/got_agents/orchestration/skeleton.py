"""Seed-skeleton loading (L4) — read authored episode shapes from JSON.

Skeletons live one file per episode under ``data/skeletons/`` (e.g.
``s1e1.json``). A seed *frames* an episode (ordered beats: setting + stakes +
cast); it never scripts outcomes (PART B.6). The Director runs whatever it loads.
"""

from __future__ import annotations

import json
from pathlib import Path

from got_agents.config import settings
from got_agents.orchestration.types import Beat, EpisodeSkeleton

_SKELETON_DIR = Path(settings.data_dir) / "skeletons"


def skeleton_dir() -> Path:
    return _SKELETON_DIR


def load_skeleton(point: str, *, directory: Path | None = None) -> EpisodeSkeleton:
    """Load one episode's seed skeleton (e.g. ``"s1e1"``)."""
    path = (directory or _SKELETON_DIR) / f"{point}.json"
    raw = json.loads(path.read_text())
    beats = tuple(
        Beat(
            setting=str(b["setting"]),
            stakes=str(b["stakes"]),
            cast=tuple(str(c) for c in b.get("cast") or ()),
            max_rounds=int(b.get("max_rounds") or 2),
        )
        for b in raw.get("beats") or ()
    )
    return EpisodeSkeleton(
        episode=str(raw.get("episode") or point),
        title=str(raw.get("title") or point),
        beats=beats,
    )
