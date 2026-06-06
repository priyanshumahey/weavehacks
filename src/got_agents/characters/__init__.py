from __future__ import annotations

from dataclasses import dataclass

from got_agents.agent.genome import Genome
from got_agents.characters import cersei, littlefinger, ned, stannis
from got_agents.cognition.types import Memory


@dataclass(frozen=True, slots=True)
class CharacterSpec:
    genome: Genome
    seed_memories: tuple[Memory, ...]


_REGISTRY: dict[str, CharacterSpec] = {
    "cersei": CharacterSpec(cersei.GENOME, cersei.SEED_MEMORIES),
    "ned": CharacterSpec(ned.GENOME, ned.SEED_MEMORIES),
    "stannis": CharacterSpec(stannis.GENOME, stannis.SEED_MEMORIES),
    "littlefinger": CharacterSpec(littlefinger.GENOME, littlefinger.SEED_MEMORIES),
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
