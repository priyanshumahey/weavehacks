"""Reaction-fidelity scorer — judge a response against the real canonical line.

Given the scene context (real preceding dialogue), the character's *actual* line
from the show, and the agent's generated response, an LLM judge scores how
closely the agent reacted the way the true character did — in intent, stance,
and voice. It rewards capturing the same move (a threat, a deflection, a vow),
not copying the exact words, since many phrasings are valid.

Grounding the judge on the **real line** (not a hand-written rubric) is the
anti-overfit anchor: the agent can only score well by reacting like canon.
"""

from __future__ import annotations

from dataclasses import dataclass

import weave

from got_agents.infra import llm
from got_agents.training.canon_scenes import ReactionProbe

_RUBRIC = (
    "You judge how faithfully an actor reacted in character. You are given a "
    "Game of Thrones scene: the dialogue leading up to a moment, the line the "
    "REAL character actually said next (the gold reaction), and the ACTOR's "
    "attempted line. Score how closely the actor matched the real character's "
    "reaction — the same intent, stance, power move, and voice — NOT the exact "
    "words. A different wording that makes the same move scores high; a generic "
    "or out-of-character reply scores low.\n"
    "  1.0 = same reaction and voice as canon; indistinguishable in spirit.\n"
    "  0.7 = right instinct and tone, slightly off.\n"
    "  0.4 = plausible but generic, or misreads the moment.\n"
    "  0.0 = wrong reaction, out of character, or anachronistic.\n"
    'Respond with JSON: {"score": number in [0,1], "matches_intent": boolean, '
    '"rationale": one short sentence}.'
)


@dataclass(frozen=True, slots=True)
class ReactionScore:
    score: float
    matches_intent: bool
    rationale: str


@weave.op
def score_reaction(probe: ReactionProbe, response: str) -> ReactionScore:
    if not response.strip():
        return ReactionScore(0.0, False, "empty response")
    return _score_scene(probe.context_text(), probe.gold_speaker, probe.gold_line, response)


@weave.op
def score_reaction_scene(
    scene: str, gold_speaker: str, gold_line: str, response: str
) -> ReactionScore:
    """Score a response against a gold line given raw scene text (no probe object)."""
    if not response.strip():
        return ReactionScore(0.0, False, "empty response")
    return _score_scene(scene, gold_speaker, gold_line, response)


def _score_scene(
    scene: str, gold_speaker: str, gold_line: str, response: str
) -> ReactionScore:
    messages = [
        {"role": "system", "content": _RUBRIC},
        {
            "role": "user",
            "content": (
                f"SCENE (dialogue so far):\n{scene}\n\n"
                f"REAL {gold_speaker} said:\n{gold_line}\n\n"
                f"ACTOR's attempt:\n{response}"
            ),
        },
    ]
    raw = llm.complete_json(messages)
    try:
        score = max(0.0, min(1.0, float(raw.get("score", 0.0))))
    except (TypeError, ValueError):
        score = 0.0
    return ReactionScore(
        score=score,
        matches_intent=bool(raw.get("matches_intent", False)),
        rationale=str(raw.get("rationale", "")),
    )
