"""Ledger loading (L4) — read canon event JSON files into ``LedgerEvent``s.

Ledgers are stored one JSON file per episode under ``data/ledger/`` (e.g.
``s1e1.json``) so the canon timeline is built and reviewed incrementally,
S1E1 -> S7. ``load_ledger`` merges any number of episode files into a single
ordered ledger that ``fold(ledger, T)`` consumes.
"""

from __future__ import annotations

import json
from pathlib import Path

from got_agents.config import settings
from got_agents.world.types import LedgerEvent

_LEDGER_DIR = Path(settings.data_dir) / "ledger"


def ledger_dir() -> Path:
    return _LEDGER_DIR


def load_episode(point: str, *, directory: Path | None = None) -> list[LedgerEvent]:
    """Load one episode's ledger file (e.g. ``"s1e1"``)."""
    path = (directory or _LEDGER_DIR) / f"{point}.json"
    raw = json.loads(path.read_text())
    return [LedgerEvent.from_dict(e) for e in raw.get("events", [])]


def load_ledger(
    points: list[str] | None = None, *, directory: Path | None = None
) -> list[LedgerEvent]:
    """Merge episode ledger files into one ordered ledger.

    With ``points=None`` every ``*.json`` file in the ledger directory is loaded.
    The result is sorted on the canon ``(code, order)`` axis.
    """
    directory = directory or _LEDGER_DIR
    if points is None:
        files = sorted(directory.glob("s*e*.json"))
    else:
        files = [directory / f"{p}.json" for p in points]
    events: list[LedgerEvent] = []
    for path in files:
        raw = json.loads(path.read_text())
        events.extend(LedgerEvent.from_dict(e) for e in raw.get("events", []))
    events.sort(key=lambda e: e.sort_key)
    return events
