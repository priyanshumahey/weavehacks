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

# Sprite hint for the Phaser replay body — maps a registry key to the charset
# frame directory under ``world/charsets/sprites/<name>``. Names differ from the
# genome name where the show uses a nickname (Eddard->ned stark, Petyr->
# littlefinger baelish). The body may override; this is only a default.
_CHARSET: dict[str, str] = {
    "cersei": "cersei lannister",
    "ned": "ned stark",
    "stannis": "stannis baratheon",
    "littlefinger": "littlefinger baelish",
}


def charset_for(key: str) -> str | None:
    """The charset sprite directory name for a character key, if known."""
    return _CHARSET.get(key)


def get_character(key: str) -> CharacterSpec:
    if key in _REGISTRY:
        return _REGISTRY[key]
    # Fall back to a pipeline-authored core on disk (PART E). The load path is
    # pure JSON -> genome (no LLM), so the chatbot test still holds.
    from got_agents.data_pipeline import cores

    if cores.core_exists(key):
        core = cores.load_core(key)
        return CharacterSpec(core.genome, core.seed_memories())
    raise KeyError(
        f"unknown character {key!r}; known: {sorted(_REGISTRY)} "
        f"(and no authored core at data/cores/{cores.slug(key)}.json)"
    )


def known() -> list[str]:
    return sorted(_REGISTRY)


def key_for_name(name: str) -> str | None:
    """Map a character's full name (e.g. "Eddard Stark") to its registry key.

    Chronicles record speakers by ``genome.name``; scorers/loaders need the key
    (``"ned"`` for "Eddard Stark"). Matches the full name first, then a
    first-name fallback for pipeline-authored cores.
    """
    target = name.strip().lower()
    for key, spec in _REGISTRY.items():
        if spec.genome.name.strip().lower() == target:
            return key
    first = target.split()[0] if target else ""
    if first in _REGISTRY:
        return first
    return None
