from __future__ import annotations

from dataclasses import dataclass

import weave

from got_agents.agent import Decision, Lord, Perception, SceneLine

DEFAULT_MAX_ROUNDS = 3


@dataclass(frozen=True, slots=True)
class CouncilTurn:
    speaker: str
    round: int
    decision: Decision


@dataclass(frozen=True, slots=True)
class CouncilTranscript:
    setting: str
    stakes: str
    cast: tuple[str, ...]
    turns: tuple[CouncilTurn, ...]
    appraisals: dict[str, object]

    def public_script(self) -> str:
        spoken = [
            f"{turn.speaker}: {turn.decision.dialogue}"
            for turn in self.turns
            if turn.decision.dialogue.strip()
        ]
        return "\n".join(spoken)


@weave.op
def run_council(
    cast: list[Lord],
    *,
    setting: str,
    stakes: str,
    max_rounds: int = DEFAULT_MAX_ROUNDS,
    appraise: bool = True,
) -> CouncilTranscript:
    names = tuple(lord.genome.name for lord in cast)
    history: list[SceneLine] = []
    turns: list[CouncilTurn] = []

    def take_turn(lord: Lord, rnd: int) -> None:
        perception = Perception(
            setting=setting,
            stakes=stakes,
            cast=names,
            speaker=lord.genome.name,
            round=rnd,
            history=tuple(history),
        )
        decision = lord.act(perception)
        turns.append(CouncilTurn(lord.genome.name, rnd, decision))
        if decision.dialogue.strip():
            history.append(decision.as_line(lord.genome.name))

    for rnd in range(1, max_rounds + 1):
        for lord in cast:
            take_turn(lord, rnd)
    if cast:
        take_turn(cast[0], max_rounds + 1)

    appraisals: dict[str, object] = {}
    if appraise:
        public = _render_public(turns)
        for lord in cast:
            own = _render_own_intents(lord.genome.name, turns)
            appraisals[lord.genome.name] = lord.appraise(public, own)

    return CouncilTranscript(
        setting=setting,
        stakes=stakes,
        cast=names,
        turns=tuple(turns),
        appraisals=appraisals,
    )


def _render_public(turns: list[CouncilTurn]) -> str:
    lines = [
        f"{turn.speaker}: {turn.decision.dialogue}"
        for turn in turns
        if turn.decision.dialogue.strip()
    ]
    return "\n".join(lines) or "(the council sat in silence)"


def _render_own_intents(speaker: str, turns: list[CouncilTurn]) -> str:
    own = [
        f'You said "{turn.decision.dialogue or "(stayed silent)"}" '
        f"while truly meaning to {turn.decision.private_intent or 'nothing in particular'}."
        for turn in turns
        if turn.speaker == speaker
    ]
    return "\n".join(own) or "You said nothing."
