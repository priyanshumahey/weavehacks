"""Season-scale ingest (PART E.3, Step 5) — author episodes incrementally.

Walks a list of story points in canon order. For each: extract the ledger
(passing forward earlier secret slugs for continuity), persist it, **smoke-test**
the cumulative world, and optionally seed canon memories to that episode's
present cast. Stops on the first smoke failure unless told to continue — the
"build incrementally, smoke-test per episode" discipline so drift can't compound.

Hand-authored ledgers (e.g. ``s1e1.json``) are protected: not overwritten unless
``overwrite`` is set, so the golden reference survives a re-run.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import weave

from got_agents.data_pipeline import canon_memory, ledger_extract
from got_agents.data_pipeline.smoke import SmokeResult, smoke_test_episode
from got_agents.world import load_ledger
from got_agents.world.ledger import ledger_dir


@dataclass(frozen=True, slots=True)
class EpisodeIngest:
    point: str
    extracted: bool
    event_count: int
    smoke: SmokeResult
    canon_memories: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class SeasonReport:
    episodes: tuple[EpisodeIngest, ...] = ()

    @property
    def ok(self) -> bool:
        return all(e.smoke.ok for e in self.episodes)

    def report(self) -> str:
        lines = [e.smoke.report() for e in self.episodes]
        lines.append(f"\n{'ALL OK' if self.ok else 'FAILURES PRESENT'} "
                     f"({len(self.episodes)} episodes)")
        return "\n".join(lines)


def _ledger_exists(point: str) -> bool:
    return (ledger_dir() / f"{point}.json").exists()


@weave.op
def ingest_season(
    points: list[str],
    *,
    extract: bool = True,
    overwrite: bool = False,
    seed_memories: bool = True,
    stop_on_fail: bool = True,
) -> SeasonReport:
    """Author and validate a sequence of episodes in canon order."""
    results: list[EpisodeIngest] = []
    prev: str | None = None

    for point in points:
        extracted = False
        if extract and (overwrite or not _ledger_exists(point)):
            prior = ledger_extract.known_secrets_before(point, load_ledger())
            events = ledger_extract.extract_episode(point, known_secrets=prior)
            ledger_extract.write_episode_ledger(point, events, overwrite=True)
            extracted = True

        full = load_ledger()
        count = sum(1 for e in full if e.point == point)
        smoke = smoke_test_episode(point, ledger=full, prev_point=prev)

        mems: dict[str, int] = {}
        if seed_memories and smoke.ok and _ledger_exists(point):
            mems = canon_memory.seed_episode_memories(point).seeded

        results.append(
            EpisodeIngest(
                point=point,
                extracted=extracted,
                event_count=count,
                smoke=smoke,
                canon_memories=mems,
            )
        )
        if not smoke.ok and stop_on_fail:
            break
        prev = point

    return SeasonReport(episodes=tuple(results))
