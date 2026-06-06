"""Raw-data access for the author phase (PART E).

Pure, side-effect-free readers over the two repo assets:
- ``data/Game_of_Thrones_Script.csv`` — 23,912 dialogue rows (565 speakers);
- ``data/got_episodes.json`` — 73 episode synopses.

No LLM calls here — this is the deterministic layer the LLM-assisted authoring
pipelines (``cores.py``, ``ledger_extract.py``) sit on top of.
"""

from __future__ import annotations

import csv
import json
import re
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from got_agents.config import settings

_SCRIPT_CSV = Path(settings.data_dir) / "Game_of_Thrones_Script.csv"
_EPISODES_JSON = Path(settings.data_dir) / "got_episodes.json"

# Authoring tiers by series-wide line count (PART E.1).
FULL_CORE_MIN = 20
LIGHT_CORE_MIN = 5

_SEASON_RE = re.compile(r"(\d+)")


@dataclass(frozen=True, slots=True)
class Line:
    point: str  # "s1e1"
    speaker: str
    text: str


def _point(season_cell: str, episode_cell: str) -> str:
    s = _SEASON_RE.search(season_cell)
    e = _SEASON_RE.search(episode_cell)
    return f"s{int(s.group(1))}e{int(e.group(1))}" if s and e else ""


@lru_cache(maxsize=1)
def _all_lines() -> tuple[Line, ...]:
    rows: list[Line] = []
    with _SCRIPT_CSV.open(newline="") as f:
        for row in csv.DictReader(f):
            speaker = (row.get("Name") or "").strip().lower()
            text = (row.get("Sentence") or "").strip()
            if not speaker or not text:
                continue
            point = _point(row.get("Season", ""), row.get("Episode", ""))
            if point:
                rows.append(Line(point=point, speaker=speaker, text=text))
    return tuple(rows)


def lines_for_speaker(speaker: str, *, up_to: str | None = None) -> list[Line]:
    """All of a speaker's lines, optionally only those at or before ``up_to``."""
    from got_agents.cognition import canon_time

    key = speaker.strip().lower()
    cutoff = canon_time.code(up_to) if up_to else None
    out = [ln for ln in _all_lines() if ln.speaker == key]
    if cutoff is not None:
        out = [ln for ln in out if canon_time.code(ln.point) <= cutoff]
    return out


def lines_in_episode(point: str) -> list[Line]:
    return [ln for ln in _all_lines() if ln.point == point]


def speakers_in_episode(point: str) -> Counter[str]:
    return Counter(ln.speaker for ln in lines_in_episode(point))


@lru_cache(maxsize=1)
def line_counts() -> Counter[str]:
    """Series-wide line count per speaker (drives the authoring tier)."""
    return Counter(ln.speaker for ln in _all_lines())


def tier_of(speaker: str) -> str:
    """``"full"`` (>=20 lines), ``"light"`` (>=5), or ``"stub"`` (<5)."""
    n = line_counts()[speaker.strip().lower()]
    if n >= FULL_CORE_MIN:
        return "full"
    if n >= LIGHT_CORE_MIN:
        return "light"
    return "stub"


@lru_cache(maxsize=1)
def _episodes() -> tuple[dict, ...]:
    return tuple(json.loads(_EPISODES_JSON.read_text()))


def synopsis(point: str) -> str:
    from got_agents.cognition import canon_time

    code = canon_time.code(point)
    for ep in _episodes():
        if int(ep["season"]) * 100 + int(ep["episode"]) == code:
            return str(ep.get("synopsis") or "")
    raise KeyError(f"no synopsis for {point!r}")
