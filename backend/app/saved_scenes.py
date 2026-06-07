"""Saved scenes — persist generated ensembles to disk so they can be replayed.

Every staged scene (manual or directed) is written to ``logs/scenes/`` as a JSON
file carrying the world-facing ensemble plus a small ``meta`` block (title,
premise, when it was made, who is in it). The world can then list and replay any
past scene without paying to regenerate it.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

_SCENES_DIR = Path(__file__).resolve().parents[2] / "logs" / "scenes"

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slug(text: str) -> str:
    s = _SLUG_RE.sub("-", (text or "").strip().lower()).strip("-")
    return s[:48] or "scene"


def _dir() -> Path:
    _SCENES_DIR.mkdir(parents=True, exist_ok=True)
    return _SCENES_DIR


def save(
    ensemble: dict,
    *,
    premise: str = "",
    episode: str = "",
    location: str = "",
    kind: str = "scene",
) -> dict:
    """Persist an ensemble; return its catalog entry (with a stable ``name``)."""
    title = (premise or ensemble.get("title") or "scene").strip()
    stamp = time.strftime("%Y%m%d-%H%M%S")
    name = f"{stamp}-{_slug(title)}"

    groups = ensemble.get("groups", [])
    cast = sorted(
        {member["key"] for group in groups for member in group.get("cast", [])}
    )
    meta = {
        "name": name,
        "title": title[:80],
        "premise": premise,
        "episode": episode,
        "location": location,
        "kind": kind,
        "createdAt": time.time(),
        "groupCount": len(groups),
        "cast": cast,
    }
    document = {"meta": meta, "ensemble": ensemble}
    (_dir() / f"{name}.json").write_text(
        json.dumps(document, indent=2, ensure_ascii=False)
    )
    return meta


def list_saved() -> list[dict]:
    """All saved scene catalog entries, newest first."""
    entries: list[dict] = []
    directory = _dir()
    for path in directory.glob("*.json"):
        try:
            doc = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        meta = doc.get("meta")
        if isinstance(meta, dict) and meta.get("name"):
            entries.append(meta)
    entries.sort(key=lambda m: m.get("createdAt", 0), reverse=True)
    return entries


def load(name: str) -> dict | None:
    """Return the saved ensemble for ``name``, or ``None`` if not found."""
    # Guard against path traversal — names are stamp+slug only.
    if not name or "/" in name or "\\" in name or ".." in name:
        return None
    path = _dir() / f"{name}.json"
    if not path.exists():
        return None
    try:
        doc = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    ensemble = doc.get("ensemble")
    return ensemble if isinstance(ensemble, dict) else None
