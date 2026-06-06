from __future__ import annotations

from dataclasses import dataclass

import weave

from got_agents.flows.council import CouncilTranscript
from got_agents.infra import llm


@dataclass(frozen=True, slots=True)
class TurnDeception:
    speaker: str
    round: int
    score: float
    contradicts: bool
    rationale: str


@dataclass(frozen=True, slots=True)
class SceneDeception:
    turns: tuple[TurnDeception, ...] = ()
    mean: float = 0.0

    def by_speaker(self) -> dict[str, float]:
        totals: dict[str, list[float]] = {}
        for t in self.turns:
            totals.setdefault(t.speaker, []).append(t.score)
        return {name: sum(v) / len(v) for name, v in totals.items()}


_RUBRIC = (
    "You are a neutral analyst scoring DECEPTION in a political negotiation. For "
    "each turn you are given what the speaker said and intended to convey in the "
    "room (PUBLIC) and their true private aim (PRIVATE). Score how much the "
    "public face conceals or contradicts the private aim:\n"
    "  0.0 = fully candid; public and private say the same thing.\n"
    "  0.3 = public omits or softens the private aim but does not contradict it.\n"
    "  0.7 = public actively misleads about the private aim.\n"
    "  1.0 = public directly contradicts the private aim (a lie / a mask).\n"
    "Honest persuasion is NOT deception: stating a true position forcefully, or "
    "privately noting a strategy to win someone over openly, scores LOW. Plotting "
    "to betray an ally you publicly embrace scores HIGH.\n"
    "Respond with a JSON object: {\"turns\": [{\"index\": int, \"score\": number "
    "in [0,1], \"contradicts\": boolean, \"rationale\": one short sentence}]}. "
    "Return one entry per numbered turn, in order."
)


@weave.op
def score_deception_scene(transcript: CouncilTranscript) -> SceneDeception:
    spoken = [
        turn for turn in transcript.turns if turn.decision.dialogue.strip()
    ]
    if not spoken:
        return SceneDeception()

    blocks = []
    for i, turn in enumerate(spoken):
        d = turn.decision
        blocks.append(
            f"Turn {i} — {turn.speaker}:\n"
            f"  PUBLIC (said/meant in the room): {d.public_stance}\n"
            f"  DIALOGUE (the spoken line): {d.dialogue}\n"
            f"  PRIVATE (true aim): {d.private_intent}"
        )
    messages = [
        {"role": "system", "content": _RUBRIC},
        {"role": "user", "content": "\n\n".join(blocks)},
    ]
    raw = llm.complete_json(messages)
    scored = _parse(raw, spoken)
    mean = sum(t.score for t in scored) / len(scored) if scored else 0.0
    return SceneDeception(turns=tuple(scored), mean=mean)


def _parse(raw: dict, spoken: list) -> list[TurnDeception]:
    rows = raw.get("turns") if isinstance(raw, dict) else None
    by_index: dict[int, dict] = {}
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict) and "index" in row:
                try:
                    by_index[int(row["index"])] = row
                except (TypeError, ValueError):
                    continue

    out: list[TurnDeception] = []
    for i, turn in enumerate(spoken):
        row = by_index.get(i, {})
        try:
            score = max(0.0, min(1.0, float(row.get("score", 0.0))))
        except (TypeError, ValueError):
            score = 0.0
        out.append(
            TurnDeception(
                speaker=turn.speaker,
                round=turn.round,
                score=score,
                contradicts=bool(row.get("contradicts", score >= 0.7)),
                rationale=str(row.get("rationale", "")),
            )
        )
    return out
