"""Orchestration types (L4) — the seed skeleton and episode result.

The lean Step-3 spine: an episode is an **ordered list of beats** (the
seed-provided skeleton, PART B.6). Each beat names a setting, the stakes, and a
candidate cast; the Director convenes a council per beat, resolves the decisions
into the live world, and stops when the beats are exhausted. No emergent scene
insertion, no Redis world store, no event bus yet — those are deferred.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from got_agents.flows.council import CouncilTranscript
from got_agents.world.types import WorldSnapshot


@dataclass(frozen=True, slots=True)
class Beat:
    """One scheduled scene the Director will convene."""

    setting: str
    stakes: str
    cast: tuple[str, ...]
    max_rounds: int = 2


@dataclass(frozen=True, slots=True)
class EpisodeSkeleton:
    """A seed-provided, ordered shape for an episode."""

    episode: str  # canon story point, e.g. "s1e1"
    title: str
    beats: tuple[Beat, ...] = ()


@dataclass(frozen=True, slots=True)
class SceneResult:
    """What one convened scene produced."""

    beat: Beat
    transcript: CouncilTranscript
    effects: tuple[dict, ...] = ()  # world changes resolved this scene


@dataclass(slots=True)
class EpisodeResult:
    """The full record of a run episode — the lean precursor to a chronicle."""

    episode: str
    title: str
    scenes: list[SceneResult] = field(default_factory=list)
    world_start: WorldSnapshot | None = None
    world_end: WorldSnapshot | None = None
    reflections: dict[str, object] = field(default_factory=dict)
