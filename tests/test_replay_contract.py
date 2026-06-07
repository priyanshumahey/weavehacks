"""Pure-logic tests for the replay contract (chronicle -> world-facing JSON)."""

from __future__ import annotations

import json

from got_agents.outputs import replay_contract


def _chronicle() -> dict:
    return {
        "episode": "s1e1",
        "title": "Winter Is Coming",
        "scenes": [
            {
                "index": 0,
                "setting": "the feast hall",
                "stakes": "the succession",
                "cast": ["ned", "cersei"],
                "turns": [
                    {
                        "round": 1, "speaker": "Cersei Lannister", "action": "speak",
                        "target": "Eddard Stark", "dialogue": "Welcome, Lord Stark.",
                        "public_stance": "gracious queen",
                        "private_intent": "measure his honor for breaking",
                        "thinking": "ice can crack",
                    },
                    {
                        "round": 1, "speaker": "Petyr Baelish", "action": "share_secret",
                        "target": "Cersei Lannister", "dialogue": "His honor is a leash.",
                        "public_stance": "prudent councillor",
                        "private_intent": "set wolf and lion watching each other",
                        "thinking": "coin has two faces",
                    },
                ],
                "effects": [{"op": "ally", "who": ["cersei lannister", "littlefinger"]}],
            }
        ],
        "world_start": {"point": "s1e1", "dead": ["jon arryn"]},
        "world_end": {"point": "s1e1", "dead": ["jon arryn"]},
        "reflections": {},
    }


def test_replay_resolves_keys_and_charsets() -> None:
    replay = replay_contract.to_replay(_chronicle())
    by_key = {c["key"]: c for c in replay["cast"]}
    # Names map to stable keys, including the nickname cases.
    assert by_key["cersei"]["charset"] == "cersei lannister"
    assert by_key["littlefinger"]["name"] == "Petyr Baelish"
    assert by_key["littlefinger"]["charset"] == "littlefinger baelish"


def test_replay_turns_carry_public_and_private() -> None:
    replay = replay_contract.to_replay(_chronicle())
    turn = replay["scenes"][0]["turns"][1]
    assert turn["speaker"] == "littlefinger"
    assert turn["target"] == "cersei"
    assert turn["action"] == "share_secret"
    assert turn["publicStance"] == "prudent councillor"
    assert "watching each other" in turn["privateIntent"]


def test_replay_is_json_serializable_and_versioned() -> None:
    replay = replay_contract.to_replay(_chronicle())
    blob = json.dumps(replay)  # must not raise
    again = json.loads(blob)
    assert again["version"] == replay_contract.REPLAY_VERSION
    assert again["episode"] == "s1e1"
    assert again["scenes"][0]["effects"][0]["op"] == "ally"


def test_write_replay_roundtrips(tmp_path) -> None:
    path = replay_contract.write_replay(_chronicle(), root=tmp_path)
    assert path.exists()
    data = json.loads(path.read_text())
    assert data["episode"] == "s1e1"
    assert len(data["cast"]) >= 2
