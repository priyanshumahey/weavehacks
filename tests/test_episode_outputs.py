"""Pure-logic tests for Step 4: chronicle, replay, fidelity, reflect parsing.

No Redis or OpenAI — exercises serialization, round-trips, and the robustness of
the LLM-output parsers with stubbed data.
"""

from __future__ import annotations

import json

from got_agents.agent import Decision, Lord
from got_agents.flows.council import CouncilTranscript, CouncilTurn
from got_agents.orchestration.types import Beat, EpisodeResult, SceneResult
from got_agents.outputs import episode_chronicle, fidelity
from got_agents.outputs import replay as replay_mod
from got_agents.world import WorldSnapshot


def _decision(action="speak", target=None, dialogue="A line.", **kw) -> Decision:
    return Decision(
        action=action, target=target,
        public_stance=kw.get("public", "p"), private_intent=kw.get("private", "q"),
        dialogue=dialogue, thinking="t",
    )


def _result() -> EpisodeResult:
    turn = CouncilTurn(speaker="Cersei Lannister", round=1, decision=_decision())
    transcript = CouncilTranscript(
        setting="a hall", stakes="the throne", cast=("Cersei Lannister",),
        turns=(turn,), appraisals={},
    )
    scene = SceneResult(
        beat=Beat(setting="a hall", stakes="the throne", cast=("cersei",)),
        transcript=transcript,
        effects=({"op": "ally", "who": ["cersei lannister", "littlefinger"]},),
    )
    start = WorldSnapshot(point="s1e1")
    end = WorldSnapshot(point="s1e1")
    end.apply({"op": "ally", "who": ["cersei lannister", "littlefinger"]})
    return EpisodeResult(
        episode="s1e1", title="t", scenes=[scene],
        world_start=start, world_end=end, reflections={},
    )


# --- chronicle serialization ----------------------------------------------


def test_chronicle_to_dict_captures_turns_effects_world() -> None:
    record = episode_chronicle.to_dict(_result())
    assert record["episode"] == "s1e1"
    assert record["scene_count"] == 1
    turn = record["scenes"][0]["turns"][0]
    assert turn["speaker"] == "Cersei Lannister"
    assert turn["private_intent"] == "q"  # the deception layer is preserved
    assert record["scenes"][0]["effects"][0]["op"] == "ally"
    assert record["world_end"]["alliances"] == [["cersei lannister", "littlefinger"]]
    assert record["world_start"]["alliances"] == []


def test_chronicle_json_is_serializable_and_replayable() -> None:
    record = episode_chronicle.to_dict(_result())
    blob = json.dumps(record)  # must not raise
    text = replay_mod.render_text(json.loads(blob))
    assert "EPISODE s1e1" in text
    assert "Cersei Lannister" in text


def test_replay_roundtrips_from_disk(tmp_path) -> None:
    json_path, txt_path = episode_chronicle.write_episode(_result(), root=tmp_path)
    assert json_path.exists() and txt_path.exists()
    rendered = replay_mod.replay_chronicle(json_path)
    assert "EPISODE s1e1" in rendered
    assert "+ {" in rendered  # the world-change effect line


def test_chronicle_includes_reflections() -> None:
    from got_agents.agent.types import Reflection

    result = _result()
    result.reflections = {
        "Cersei Lannister": Reflection(
            summary="I tightened my grip.",
            rules=("trust no one",),
            relationships={"Littlefinger": "a useful knife"},
        )
    }
    record = episode_chronicle.to_dict(result)
    refl = record["reflections"]["Cersei Lannister"]
    assert refl["summary"] == "I tightened my grip."
    assert refl["rules"] == ["trust no one"]
    text = episode_chronicle.render_text(record)
    assert "carries forward" in text.lower()


# --- fidelity parsing -----------------------------------------------------


def test_fidelity_parse_clamps_and_flags() -> None:
    c = fidelity._parse("Cersei", {"score": 1.5, "violation": True, "rationale": "x"})
    assert c.score == 1.0 and c.violation is True
    c2 = fidelity._parse("Ned", {"score": "bad"})
    assert c2.score == 0.0 and c2.violation is False


def test_fidelity_speaker_key_maps_to_character() -> None:
    assert fidelity._speaker_key("Cersei Lannister") == "cersei"
    assert fidelity._speaker_key("Eddard Stark") == "ned"  # name != key
    assert fidelity._speaker_key("Petyr Baelish") == "littlefinger"
    assert fidelity._speaker_key("Nobody Here") is None
    assert fidelity._profile("cersei") is not None
    assert fidelity._profile("nobody-here") is None


# --- reflect parsing ------------------------------------------------------


def test_reflect_parse_handles_partial_and_bad_shapes() -> None:
    refl = Lord._parse_reflection(
        {
            "summary": "I learned to wait.",
            "rules": ["bide your time", 5, ""],
            "relationships": {"Ned": "an obstacle"},
            "concepts": ["patience"],
        }
    )
    assert refl.summary == "I learned to wait."
    assert "bide your time" in refl.rules
    assert refl.relationships["Ned"] == "an obstacle"
    assert refl.concepts == ("patience",)


def test_reflect_parse_empty() -> None:
    refl = Lord._parse_reflection({})
    assert refl.summary == ""
    assert refl.rules == ()
    assert refl.relationships == {}
