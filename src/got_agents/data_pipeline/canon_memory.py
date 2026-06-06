"""Ledger -> memory bridge (PART A.4 + B.2 membership) — canon facts as memories.

``fold`` feeds the ledger into *world state*; this seeds the same canon events
into each entitled character's *memory stream*, so a Lord loaded at a story point
actually remembers what happened up to then. Membership-correct:

- **public** events are common knowledge — seeded to the episode audience plus
  any named participants;
- **secret** events reach only their ``known_to`` set — so a secret a character
  is not party to never enters their memory.

Each memory is **canon-dated** (the event's story point), so the as-of horizon
in ``MemoryStore.retrieve`` hides events after a past T automatically. Concepts
are grounded in each character's own Fixed Bag where they overlap the summary, so
canon memories surface under the A.4 hybrid retrieval. Deterministic and
idempotent (stable ids) — pure author-phase data work, no per-tick cost.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import weave

from got_agents.characters import get_character, key_for_name
from got_agents.cognition import canon_time
from got_agents.cognition.memory import MemoryStore
from got_agents.cognition.types import Memory
from got_agents.data_pipeline import cores, sources
from got_agents.world import load_ledger
from got_agents.world.types import LedgerEvent

# Importance by event kind — deaths/secrets weigh heaviest, ceremony lighter.
_IMPORTANCE = {
    "secret": 0.85,
    "reveal": 0.82,
    "betrayal": 0.85,
    "death": 0.8,
    "attack": 0.75,
    "oath": 0.65,
    "marriage": 0.6,
    "title": 0.6,
    "rumor": 0.6,
    "betrothal": 0.55,
    "omen": 0.5,
}
_DEFAULT_IMPORTANCE = 0.5


@dataclass(frozen=True, slots=True)
class CanonSeedReport:
    point: str
    seeded: dict[str, int] = field(default_factory=dict)  # key -> # memories

    @property
    def total(self) -> int:
        return sum(self.seeded.values())


def _resolve_key(name: str) -> str | None:
    """Map a ledger name (lowercase full name) to a loadable character key."""
    key = key_for_name(name)
    if key:
        return key
    slug = cores.slug(name)
    return slug if cores.core_exists(slug) else None


def _audience_keys(point: str, audience: list[str] | None) -> set[str]:
    """The 'present this episode' set for public events.

    Defaults to the episode's actual **speakers** (who was on screen), resolved
    to loadable character keys — so a public event only reaches characters who
    were present, not every authored core. An explicit ``audience`` overrides.
    """
    names = audience if audience is not None else list(sources.speakers_in_episode(point))
    return {k for k in (_resolve_key(a) for a in names) if k}


def _recipients(event: LedgerEvent, audience: set[str]) -> set[str]:
    """Which loadable characters this event enters the memory of."""
    if event.visibility == "secret":
        names = set(event.known_to)
        return {k for k in (_resolve_key(n) for n in names) if k}
    # public = common knowledge: the audience plus any named participants.
    keys = set(audience)
    for name in event.participants:
        if key := _resolve_key(name):
            keys.add(key)
    return keys


def _concepts(event: LedgerEvent, fixed_bag: tuple[str, ...]) -> tuple[str, ...]:
    summary = event.summary.lower()
    grounded = [c for c in fixed_bag if c.lower() in summary]
    out = [event.type, *grounded]
    seen: set[str] = set()
    return tuple(c for c in out if c and not (c in seen or seen.add(c)))


def _memory_for(event: LedgerEvent, key: str, fixed_bag: tuple[str, ...]) -> Memory:
    return Memory(
        id=f"{key}:ledger:{event.id}",
        text=event.summary,
        importance=_IMPORTANCE.get(event.type, _DEFAULT_IMPORTANCE),
        timestamp=canon_time.to_timestamp(event.point),
        concepts=_concepts(event, fixed_bag),
    )


@weave.op
def seed_episode_memories(
    point: str,
    *,
    audience: list[str] | None = None,
    ledger: list[LedgerEvent] | None = None,
) -> CanonSeedReport:
    """Seed every entitled character's memory with this episode's canon events.

    ``audience`` (names) overrides the default 'everyone we can load' set for
    public events; secret events always reach only their ``known_to``.
    """
    events = ledger if ledger is not None else load_ledger([point])
    events = [e for e in events if e.point == point]
    audience_keys = _audience_keys(point, audience)

    stores: dict[str, MemoryStore] = {}
    bags: dict[str, tuple[str, ...]] = {}
    seeded: dict[str, int] = {}

    for event in events:
        for key in _recipients(event, audience_keys):
            store = stores.get(key)
            if store is None:
                try:
                    bags[key] = get_character(key).genome.fixed_bag
                except KeyError:
                    continue  # unknown/unloadable — skip
                store = MemoryStore(key)
                store.ensure()
                stores[key] = store
            store.encode(_memory_for(event, key, bags[key]))
            seeded[key] = seeded.get(key, 0) + 1

    return CanonSeedReport(point=point, seeded=seeded)
