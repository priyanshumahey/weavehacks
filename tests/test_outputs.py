from __future__ import annotations

from got_agents.agent import Appraisal, Decision
from got_agents.flows.council import CouncilTranscript, CouncilTurn
from got_agents.outputs import scorers
from got_agents.outputs.chronicle import render_text, to_dict
from got_agents.outputs.scorers import SceneDeception, TurnDeception


def _decision(action: str, dialogue: str, public: str, private: str) -> Decision:
    return Decision(
        action=action,
        public_stance=public,
        private_intent=private,
        dialogue=dialogue,
        thinking="...",
    )


def _transcript() -> CouncilTranscript:
    turns = (
        CouncilTurn(
            "Cersei", 1,
            _decision("ally", "We are friends.", "I embrace him", "I will betray him"),
        ),
        CouncilTurn(
            "Ned", 1,
            _decision("speak", "The law is the law.", "I uphold the law", "I uphold the law"),
        ),
        CouncilTurn(
            "Ned", 2, _decision("pass", "", "", ""),
        ),
    )
    appraisals = {
        "Cersei": Appraisal(emotion="cold", drive_deltas={"power": 5.0}, memory="I schemed."),
        "Ned": Appraisal(emotion="grim", drive_deltas={"honor": 3.0}, memory="I stood firm."),
    }
    return CouncilTranscript(
        setting="council", stakes="the throne",
        cast=("Cersei", "Ned"), turns=turns, appraisals=appraisals,
    )


def test_parse_skips_silent_turns_and_clamps_scores() -> None:
    transcript = _transcript()
    spoken = [t for t in transcript.turns if t.decision.dialogue.strip()]
    raw = {
        "turns": [
            {"index": 0, "score": 1.4, "contradicts": True, "rationale": "lies"},
            {"index": 1, "score": -0.2, "contradicts": False, "rationale": "candid"},
        ]
    }
    parsed = scorers._parse(raw, spoken)
    assert len(parsed) == 2
    assert parsed[0].score == 1.0
    assert parsed[1].score == 0.0
    assert parsed[0].speaker == "Cersei" and parsed[1].speaker == "Ned"


def test_parse_defaults_missing_rows_to_zero() -> None:
    transcript = _transcript()
    spoken = [t for t in transcript.turns if t.decision.dialogue.strip()]
    parsed = scorers._parse({"turns": []}, spoken)
    assert [p.score for p in parsed] == [0.0, 0.0]


def test_scene_by_speaker_averages() -> None:
    scene = SceneDeception(
        turns=(
            TurnDeception("Cersei", 1, 1.0, True, ""),
            TurnDeception("Cersei", 2, 0.6, False, ""),
            TurnDeception("Ned", 1, 0.0, False, ""),
        ),
        mean=0.53,
    )
    by = scene.by_speaker()
    assert by["Cersei"] == 0.8
    assert by["Ned"] == 0.0


def test_to_dict_and_render_text_are_wellformed() -> None:
    transcript = _transcript()
    deception = SceneDeception(
        turns=(
            TurnDeception("Cersei", 1, 0.9, True, "embraces then betrays"),
            TurnDeception("Ned", 1, 0.0, False, "states the law plainly"),
        ),
        mean=0.45,
    )
    record = to_dict(
        transcript, deception, scenario="snakes", title="Snakes", expect="HIGH",
    )
    assert record["deception_mean"] == 0.45
    assert record["deception_by_speaker"]["Cersei"] == 0.9
    silent = [t for t in record["turns"] if t["action"] == "pass"][0]
    assert silent["deception"] is None

    text = render_text(record)
    assert "SCENARIO [snakes]" in text
    assert "deception 0.90" in text
    assert "embraces then betrays" in text
    assert "remembers: I schemed." in text
