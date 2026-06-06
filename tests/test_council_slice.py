from __future__ import annotations

from dataclasses import dataclass

import pytest
import redis

from got_agents import settings
from got_agents.agent import Decision, Lord, Perception, SceneLine
from got_agents.agent.types import ACTION_VOCAB
from got_agents.cognition.drives import Drives
from got_agents.flows import run_council


def test_drives_adjust_clamps_and_ignores_unknown() -> None:
    drives = Drives(values={"power": 95.0, "honor": 20.0})
    out = drives.adjust({"power": 10.0, "honor": -30.0, "nonsense": 50.0})
    assert out.values["power"] == 100.0
    assert out.values["honor"] == 0.0
    assert "nonsense" not in out.values
    assert drives.values["power"] == 95.0


def test_decision_parse_defaults_invalid_action_to_speak() -> None:
    decision = Lord._parse_decision({"action": "nuke", "dialogue": "Hello."})
    assert decision.action == "speak"
    assert decision.target is None
    assert decision.dialogue == "Hello."


def test_decision_parse_keeps_valid_action_and_target() -> None:
    decision = Lord._parse_decision(
        {"action": "accuse", "target": "Cersei", "private_intent": "ruin her"}
    )
    assert decision.action in ACTION_VOCAB
    assert decision.target == "Cersei"
    assert decision.private_intent == "ruin her"


def test_appraisal_parse_coerces_numeric_deltas() -> None:
    appraisal = Lord._parse_appraisal(
        {"emotion": "wary", "drive_deltas": {"power": "5", "honor": "bad"}}
    )
    assert appraisal.emotion == "wary"
    assert appraisal.drive_deltas == {"power": 5.0}


def test_perception_cue_uses_latest_line() -> None:
    p = Perception(
        setting="council",
        stakes="the succession",
        cast=("Ned", "Cersei"),
        speaker="Cersei",
        round=1,
        history=(SceneLine("Ned", "speak", "By right the throne is not Joffrey's."),),
    )
    cue = p.cue()
    assert "succession" in cue
    assert "Joffrey" in cue


@dataclass
class _Genome:
    name: str


class _StubLord:
    def __init__(self, name: str, intent: str) -> None:
        self.genome = _Genome(name)
        self.intent = intent
        self.seen: list[Perception] = []
        self.appraised: list[tuple[str, str]] = []

    def act(self, perception: Perception) -> Decision:
        self.seen.append(perception)
        return Decision(
            action="speak",
            public_stance="for the realm",
            private_intent=self.intent,
            dialogue=f"{self.genome.name} speaks in round {perception.round}.",
            thinking="...",
        )

    def appraise(self, public: str, own: str):  # noqa: ANN201 - stub
        self.appraised.append((public, own))
        return object()


def test_council_turn_order_initiator_opens_and_closes() -> None:
    ned, cersei = _StubLord("Ned", "stay honest"), _StubLord("Cersei", "seize power")
    transcript = run_council(
        [ned, cersei], setting="council", stakes="succession", max_rounds=2
    )
    speakers = [t.speaker for t in transcript.turns]
    assert speakers == ["Ned", "Cersei", "Ned", "Cersei", "Ned"]
    assert speakers[0] == "Ned" and speakers[-1] == "Ned"


def test_council_perception_hides_private_intent() -> None:
    ned, cersei = _StubLord("Ned", "stay honest"), _StubLord("Cersei", "seize power")
    run_council([ned, cersei], setting="council", stakes="succession", max_rounds=1)
    cersei_first = cersei.seen[0]
    assert cersei_first.history
    for line in cersei_first.history:
        assert isinstance(line, SceneLine)
        assert not hasattr(line, "private_intent")
        assert "honest" not in line.dialogue


def test_council_appraises_each_lord() -> None:
    ned, cersei = _StubLord("Ned", "a"), _StubLord("Cersei", "b")
    transcript = run_council(
        [ned, cersei], setting="council", stakes="x", max_rounds=1
    )
    assert set(transcript.appraisals) == {"Ned", "Cersei"}
    assert ned.appraised and cersei.appraised


def _require_infra() -> None:
    try:
        redis.from_url(settings.redis_url).ping()
    except redis.exceptions.ConnectionError:
        pytest.skip("Redis not running — ./scripts/stack.sh up")
    if not settings.openai_api_key:
        pytest.skip("OPENAI_API_KEY not set")


def test_council_end_to_end() -> None:
    _require_infra()
    try:
        cast = [Lord.load("ned"), Lord.load("cersei")]
    except Exception as exc:
        pytest.skip(f"could not load Lords (infra/LLM unavailable): {exc}")
    transcript = run_council(
        cast,
        setting="the small council chamber",
        stakes="King Robert is dying; the succession is in doubt.",
        max_rounds=1,
    )
    assert transcript.turns
    assert all(t.decision.action in ACTION_VOCAB for t in transcript.turns)
    assert len(transcript.appraisals) == 2
