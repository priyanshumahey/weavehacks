"""Reference-based fidelity scorer — judges one in-voice line against fixed canon.

Unlike ``outputs/fidelity.py`` (which scores a whole episode against the live
genome), this judges a single produced line against the **fixed** canon reference
from ``dataset.py``. Anchoring on canon — not the evolving persona — is the
anti-overfit guardrail (PART C.6): the agent cannot raise its score by rewriting
its own rubric, only by sounding more like the real character.
"""

from __future__ import annotations

from dataclasses import dataclass

import weave

from got_agents.infra import llm
from got_agents.training.dataset import CanonReference, reference_for

_RUBRIC = (
    "You are a strict Game of Thrones character-fidelity judge. You are given a "
    "character's TRUE canon profile (how they really sound) and a single line "
    "spoken in their voice. Score how faithfully the line matches the real "
    "character:\n"
    "  1.0 = unmistakably this character — register, values, cadence all ring true.\n"
    "  0.7 = mostly faithful, minor slips.\n"
    "  0.4 = generic or blurred; could be anyone.\n"
    "  0.0 = out of character, anachronistic, or against their nature.\n"
    "Judge ONLY against the canon profile, never against the line's own claims. "
    'Respond with JSON: {"score": number in [0,1], "violation": boolean, '
    '"rationale": one short sentence}.'
)


@dataclass(frozen=True, slots=True)
class LineFidelity:
    score: float
    violation: bool
    rationale: str


@weave.op
def score_line_fidelity(character: str, line: str) -> LineFidelity:
    reference = reference_for(character)
    if reference is None or not line.strip():
        return LineFidelity(score=0.0, violation=True, rationale="no reference or empty line")
    return _judge(reference, line)


def _judge(reference: CanonReference, line: str) -> LineFidelity:
    messages = [
        {"role": "system", "content": _RUBRIC},
        {
            "role": "user",
            "content": f"CANON PROFILE:\n{reference.as_prompt()}\n\nLINE SPOKEN:\n{line}",
        },
    ]
    raw = llm.complete_json(messages)
    try:
        score = max(0.0, min(1.0, float(raw.get("score", 0.0))))
    except (TypeError, ValueError):
        score = 0.0
    return LineFidelity(
        score=score,
        violation=bool(raw.get("violation", False)),
        rationale=str(raw.get("rationale", "")),
    )
