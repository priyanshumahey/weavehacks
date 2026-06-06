"""Authored character cores + seed memories (the world-data content layer).

For Step 0 this holds a single hand-authored core (Cersei). Step 2's data
pipeline (PART E) will author the full roster from the script CSV; this registry
is the interface those generated cores will populate.
"""

from __future__ import annotations

from dataclasses import dataclass

from got_agents.agent.genome import Genome
from got_agents.characters import cersei
from got_agents.cognition.types import Memory


@dataclass(frozen=True, slots=True)
class CharacterSpec:
    genome: Genome
    seed_memories: tuple[Memory, ...]


_REGISTRY: dict[str, CharacterSpec] = {
    "cersei": CharacterSpec(cersei.GENOME, cersei.SEED_MEMORIES),
}


def get_character(key: str) -> CharacterSpec:
    try:
        return _REGISTRY[key]
    except KeyError as exc:
        raise KeyError(
            f"unknown character {key!r}; known: {sorted(_REGISTRY)}"
        ) from exc


def known() -> list[str]:
    return sorted(_REGISTRY)
