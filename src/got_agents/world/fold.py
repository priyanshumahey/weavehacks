"""``fold(ledger, T)`` — derive the world snapshot at a story point (pure).

Replays every ledger event whose ``sort_key`` is at or before ``T`` (in canon
order), applying each event's effects to a fresh :class:`WorldSnapshot` via the
shared :meth:`WorldSnapshot.apply`. Pure function of ``(ledger, T)``: same
inputs always yield the same world, which is what makes any timeline point a
first-class, reproducible seed.
"""

from __future__ import annotations

from collections.abc import Iterable

from got_agents.cognition import canon_time
from got_agents.world.types import LedgerEvent, WorldSnapshot


def fold(ledger: Iterable[LedgerEvent], at: canon_time.StoryPoint) -> WorldSnapshot:
    cutoff = canon_time.code(at)
    snapshot = WorldSnapshot(point=canon_time.label(at))
    events = sorted(
        (e for e in ledger if canon_time.code(e.point) <= cutoff),
        key=lambda e: e.sort_key,
    )
    for event in events:
        snapshot.apply_all(event.effects)
    return snapshot

