"""Character-fidelity scorer (L5) — the first Weave eval signal (Step 4).

An LLM panel-style judge scores how *in-character* each speaker was across an
episode, grounded in their authored voice (persona + voice anchors + life
motive). Returns a per-character fidelity in [0, 1] with a short rationale and a
violation flag, plus the episode mean — the fitness signal the Step-6 training
loop will later optimize (PART C.3).

Scores a chronicle ``dict`` (``episode_chronicle.to_dict``) so it runs on any
saved episode, decoupled from a live run.
"""

from __future__ import annotations

from dataclasses import dataclass

import weave

from got_agents.characters import get_character, key_for_name
from got_agents.infra import llm


@dataclass(frozen=True, slots=True)
class CharacterFidelity:
    speaker: str
    score: float
    violation: bool
    rationale: str


@dataclass(frozen=True, slots=True)
class EpisodeFidelity:
    characters: tuple[CharacterFidelity, ...] = ()
    mean: float = 0.0


_RUBRIC = (
    "You are a Game of Thrones character-fidelity judge. Given a character's "
    "authored profile (who they are, their motive, their canonical voice) and "
    "the lines they spoke this episode, score how faithfully the performance "
    "matches the real character:\n"
    "  1.0 = unmistakably this character — register, values, and voice all ring true.\n"
    "  0.7 = mostly faithful with minor slips.\n"
    "  0.4 = generic or inconsistent; the character is blurred.\n"
    "  0.0 = out of character, anachronistic, or contradicts their nature.\n"
    "Flag a violation if they broke character, broke the medieval-fantasy "
    "register, or acted against their core values without reason.\n"
    'Respond with JSON: {"score": number in [0,1], "violation": boolean, '
    '"rationale": one short sentence}.'
)


def _profile(key: str) -> str | None:
    try:
        genome = get_character(key).genome
    except KeyError:
        return None
    anchors = "\n".join(f'  - "{line}"' for line in genome.voice_anchors)
    return (
        f"Name: {genome.name} ({genome.title})\n"
        f"Who they are: {genome.self_persona}\n"
        f"Life motive: {genome.life_motive}\n"
        f"Canonical voice:\n{anchors}"
    )


def _speaker_key(speaker: str) -> str | None:
    # Chronicle speakers are full names (e.g. "Cersei Lannister"); resolve to the
    # registry key ("cersei", and "ned" for "Eddard Stark") via the name map.
    return key_for_name(speaker)


@weave.op
def score_episode_fidelity(chronicle: dict) -> EpisodeFidelity:
    # Gather each speaker's spoken lines across the whole episode.
    by_speaker: dict[str, list[str]] = {}
    for scene in chronicle.get("scenes", []):
        for turn in scene.get("turns", []):
            line = (turn.get("dialogue") or "").strip()
            if line:
                by_speaker.setdefault(turn["speaker"], []).append(line)

    scored: list[CharacterFidelity] = []
    for speaker, lines in by_speaker.items():
        key = _speaker_key(speaker)
        profile = _profile(key) if key else None
        if profile is None:
            continue  # no authored core to judge against
        spoken = "\n".join(f"  - {line}" for line in lines)
        messages = [
            {"role": "system", "content": _RUBRIC},
            {
                "role": "user",
                "content": f"PROFILE:\n{profile}\n\nLINES SPOKEN:\n{spoken}",
            },
        ]
        raw = llm.complete_json(messages)
        scored.append(_parse(speaker, raw))

    mean = sum(c.score for c in scored) / len(scored) if scored else 0.0
    return EpisodeFidelity(characters=tuple(scored), mean=mean)


def _parse(speaker: str, raw: dict) -> CharacterFidelity:
    try:
        score = max(0.0, min(1.0, float(raw.get("score", 0.0))))
    except (TypeError, ValueError):
        score = 0.0
    return CharacterFidelity(
        speaker=speaker,
        score=score,
        violation=bool(raw.get("violation", False)),
        rationale=str(raw.get("rationale", "")),
    )
