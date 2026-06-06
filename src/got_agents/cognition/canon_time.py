"""Canon time — a single monotonic axis for both the world and memory.

Two senses of time in the design (AGENT_SYSTEM_DESIGN.md, HANDOFF "Timeline /
point-in-time recall") share **one comparable axis** so a scene is internally
consistent: ``fold(ledger, T)`` stages the world at T, and each Lord is loaded
with a memory horizon at the *same* T.

Granularity is **per episode**. A story point ``T`` is written ``"s1e5"`` and
maps to:

- a monotonic integer **code** ``season*100 + episode`` (``s1e5`` -> ``105``),
  used to order ledger events; and
- a synthetic Unix-epoch **timestamp** kept safely below wall-clock time so that
  conversation memories (stamped at real ``time.time()``) always sort *after*
  any canon point and thus fall outside a past as-of horizon automatically.
"""

from __future__ import annotations

import re

# Base epoch (~2011, the show's premiere year) and per-code spacing. The largest
# code is s8e6 -> 806, so max timestamp is BASE + 706*SPACING which stays well
# under the current wall clock — conversation memories therefore always sort
# after any canon point.
_BASE_EPOCH = 1_300_000_000.0
_SPACING = 400_000.0  # ~4.6 days between consecutive episode codes
_MIN_CODE = 100  # one below s1e1 (101); used as the "backstory" anchor

_TOKEN = re.compile(r"^s(\d+)e(\d+)$", re.IGNORECASE)

# A story point: an "s{season}e{episode}" string, a (season, episode) pair, or a
# raw integer code already on the season*100+episode axis.
StoryPoint = str | tuple[int, int] | int


def code(point: StoryPoint) -> int:
    """Return the monotonic integer code for a story point.

    ``"s1e5"`` / ``(1, 5)`` / ``105`` all yield ``105``.
    """
    if isinstance(point, int):
        return point
    if isinstance(point, tuple):
        season, episode = point
        return int(season) * 100 + int(episode)
    match = _TOKEN.match(point.strip())
    if not match:
        raise ValueError(f"unparseable story point {point!r}; expected e.g. 's1e5'")
    season, episode = int(match.group(1)), int(match.group(2))
    return season * 100 + episode


def to_timestamp(point: StoryPoint) -> float:
    """Map a story point to its synthetic canon Unix timestamp."""
    return _BASE_EPOCH + (code(point) - _MIN_CODE) * _SPACING


def label(point: StoryPoint) -> str:
    """Render a story point back to canonical ``"s{season}e{episode}"`` form."""
    c = code(point)
    return f"s{c // 100}e{c % 100}"


def backstory_timestamp() -> float:
    """Timestamp for facts that predate the series (always within any horizon)."""
    return _BASE_EPOCH
