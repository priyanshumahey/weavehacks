"""Shared cognition value types (L1).

Defined at the cognition layer so both the services here and the ``agent`` layer
above can use them without anyone importing ``world``/``orchestration`` — the
down-only import rule from AGENT_SYSTEM_DESIGN.md PART G.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Memory:
    """One episodic memory row.

    ``importance`` is in ``[0, 1]``; ``timestamp`` is a Unix epoch second.
    ``concepts`` are Fixed-Bag tags used for hybrid retrieval. ``score`` is only
    populated on retrieved copies (the combined retrieval score).
    """

    id: str
    text: str
    importance: float
    timestamp: float
    concepts: tuple[str, ...] = ()
    score: float | None = None
