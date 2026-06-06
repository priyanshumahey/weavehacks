"""Incremental, smoke-tested ingest (PART E.3) — author one episode end-to-end.

``ingest_episode(point)`` runs the author phase for a single episode:
1. extract + persist the canon ledger (unless a hand-authored one is protected);
2. author + persist a core for every speaker of the right **tier**;
3. ``fold`` the cumulative ledger at the episode and return a report.

Designed to be re-run idempotently and checked per episode (S1E1 -> S7), so data
drift is caught before it compounds.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from got_agents.data_pipeline import cores, ledger_extract, sources
from got_agents.world import WorldSnapshot, fold, load_ledger
from got_agents.world.ledger import ledger_dir


@dataclass(frozen=True, slots=True)
class IngestReport:
    point: str
    authored: tuple[str, ...] = ()
    skipped: tuple[str, ...] = ()
    tiers: dict[str, str] = field(default_factory=dict)
    world: WorldSnapshot | None = None
    canon_memories: dict[str, int] = field(default_factory=dict)


def _ledger_exists(point: str) -> bool:
    return (ledger_dir() / f"{point}.json").exists()


def ingest_episode(
    point: str,
    *,
    author_cores: bool = True,
    min_tier: str = "full",
    extract_ledger: bool = True,
    overwrite_ledger: bool = False,
    overwrite_cores: bool = False,
    seed_memories: bool = True,
) -> IngestReport:
    """Author one episode. Pure-data work — many small LLM calls, run once.

    ``min_tier`` controls who gets a core this pass: ``"full"`` authors only
    speakers with >=20 series lines, ``"light"`` adds the >=5 tier. Stubs are
    never authored (they exist as world state until a scene promotes them).

    ``seed_memories`` fans this episode's canon ledger into each entitled
    character's memory stream (membership-filtered, canon-dated) so a Lord loaded
    at this point remembers what happened — see ``canon_memory``.
    """
    # 1. Ledger — never silently clobber a hand-authored file.
    if extract_ledger and (overwrite_ledger or not _ledger_exists(point)):
        events = ledger_extract.extract_episode(point)
        ledger_extract.write_episode_ledger(point, events, overwrite=True)

    # 2. Cores for this episode's speakers, gated by tier.
    authored: list[str] = []
    skipped: list[str] = []
    tiers: dict[str, str] = {}
    if author_cores:
        wanted = {"full"} if min_tier == "full" else {"full", "light"}
        for speaker in sources.speakers_in_episode(point):
            tier = sources.tier_of(speaker)
            tiers[speaker] = tier
            if tier not in wanted:
                skipped.append(speaker)
                continue
            if cores.core_exists(speaker) and not overwrite_cores:
                skipped.append(speaker)
                continue
            core = cores.author_core(speaker, up_to=point)
            cores.save_core(core)
            authored.append(speaker)

    # 3. Fold the cumulative ledger at this episode for a sanity snapshot.
    world = fold(load_ledger(), point) if _ledger_exists(point) else None

    # 4. Bridge the canon ledger into character memory (membership-filtered).
    canon_memories: dict[str, int] = {}
    if seed_memories and _ledger_exists(point):
        from got_agents.data_pipeline import canon_memory

        canon_memories = canon_memory.seed_episode_memories(point).seeded

    return IngestReport(
        point=point,
        authored=tuple(authored),
        skipped=tuple(skipped),
        tiers=tiers,
        world=world,
        canon_memories=canon_memories,
    )
