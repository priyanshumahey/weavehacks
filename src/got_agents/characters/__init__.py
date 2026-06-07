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
    """The charset sprite directory name for a character key, if known.

    Registry leads use an explicit map (nicknames differ); pipeline-authored
    cores fall back to the genome's full name lowercased, which matches the
    ``world/charsets/sprites/<name>`` and portrait file naming.
    """
    if key in _CHARSET:
        return _CHARSET[key]
    try:
        return get_character(key).genome.name.strip().lower()
    except KeyError:
        return None


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


_HONORIFICS = (
    "grand maester",
    "maester",
    "lord commander",
    "lord",
    "lady",
    "ser",
    "septa",
    "septon",
    "king",
    "queen",
    "prince",
    "princess",
    "khal",
    "khaleesi",
    "magister",
    "old",
)


def _name_signature(name: str) -> str:
    """Normalize a display name for de-duplication.

    Lowercases and strips a leading honorific so "Lord Varys" and "Varys", or a
    duplicate "Ser Rodrik Cassel"/"Rodrik Cassel", collapse to one roster entry.
    """
    sig = name.strip().lower()
    changed = True
    while changed:
        changed = False
        for h in _HONORIFICS:
            if sig.startswith(h + " "):
                sig = sig[len(h) + 1 :]
                changed = True
    return sig


def _is_real_character(name: str) -> bool:
    """Exclude crowd/extra labels that the canon script lists as speakers."""
    sig = _name_signature(name)
    if not sig:
        return False
    if sig == "all" or sig.startswith("unnamed"):
        return False
    return True


def known() -> list[str]:
    """All chat-ready character keys: registry leads + on-disk authored cores.

    Crowd/extra labels ("All", "Unnamed Guard") are dropped, and cores that
    resolve to the same person (by honorific-stripped name) are de-duplicated —
    a hand-authored registry lead always wins, otherwise the lexically smallest
    key is kept for determinism.
    """
    from got_agents.data_pipeline import cores

    # signature -> chosen key. Seed with the curated leads so they always win.
    chosen: dict[str, str] = {}
    for key, spec in _REGISTRY.items():
        chosen[_name_signature(spec.genome.name)] = key
    lead_signatures = set(chosen)

    directory = cores.cores_dir()
    if directory.exists():
        for path in sorted(directory.glob("*.json")):
            stem = path.stem
            if stem in _REGISTRY:
                continue
            try:
                name = cores.load_core(stem).genome.name
            except Exception:
                continue
            if not _is_real_character(name):
                continue
            sig = _name_signature(name)
            if sig in lead_signatures:
                continue  # duplicate of a curated lead
            existing = chosen.get(sig)
            if existing is None or stem < existing:
                chosen[sig] = stem
    return sorted(chosen.values())


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
