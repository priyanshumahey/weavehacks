"""Offline tests for the continuous (timeline) episode path.

Two layers, no Redis / no LLM:
  * ``to_episode_script`` — the pure contract transform (dependency derivation,
    anchors, cast union, learning passthrough).
  * ``ContinuousDirector`` — stubbed Lords / councils / planner exercise phase
    ordering, per-character location tracking, and learning capture.
"""

from __future__ import annotations

import got_agents.flows.continuous_director as cd
from got_agents.agent.types import Appraisal, Decision, Reflection
from got_agents.flows.council import CouncilTranscript, CouncilTurn
from got_agents.flows.scene_planner import PhaseThread
from got_agents.outputs.episode_script import to_episode_script


# --- contract: to_episode_script ------------------------------------------


def _chronicle() -> dict:
    return {
        "episode": "s1e7",
        "title": "T",
        "premise": "the king names an exile",
        "threads": [
            {
                "id": "thread-0",
                "phase": 0,
                "location": "throne-room",
                "mood": "tense",
                "setting": "the throne room, the council convened",
                "stakes": "x",
                "cast": ["cersei", "tyrion", "ned"],
                "turns": [
                    {"speaker": "cersei", "action": "accuse", "target": "tyrion", "dialogue": "you"}
                ],
            },
            {
                "id": "thread-1",
                "phase": 1,
                "location": "wall",
                "mood": "friendly",
                "setting": "the top of the Wall, snow underfoot",
                "stakes": "y",
                "cast": ["tyrion", "jon"],
                "turns": [{"speaker": "tyrion", "action": "speak", "dialogue": "cold"}],
            },
            {
                "id": "thread-2",
                "phase": 1,
                "location": "throne-room",
                "mood": "hostile",
                "setting": "the throne room dais",
                "stakes": "z",
                "cast": ["cersei", "jaime"],
                "turns": [{"speaker": "cersei", "action": "ally", "target": "jaime", "dialogue": "with me"}],
            },
        ],
        "learning": {
            "driveTrajectory": {"cersei": [{"thread": "thread-0", "drives": {"power": 80}}]},
            "reflections": {"Cersei Lannister": {"summary": "I tightened my grip."}},
        },
    }


def test_script_derives_per_character_dependencies() -> None:
    script = to_episode_script(_chronicle())
    by_id = {t["id"]: t for t in script["threads"]}
    # thread-0 opens (no deps).
    assert by_id["thread-0"]["dependsOn"] == []
    # tyrion was in thread-0, so his wall thread depends on it.
    assert by_id["thread-1"]["dependsOn"] == ["thread-0"]
    # cersei was in thread-0, so her plot with jaime depends on it.
    assert by_id["thread-2"]["dependsOn"] == ["thread-0"]


def test_script_cast_union_and_locations() -> None:
    script = to_episode_script(_chronicle())
    keys = {c["key"] for c in script["cast"]}
    assert keys == {"cersei", "tyrion", "ned", "jon", "jaime"}
    locs = {t["locationId"] for t in script["threads"]}
    assert locs == {"throne-room", "wall"}
    assert script["version"] == 2 and script["kind"] == "episode-script"


def test_script_concurrent_same_location_threads_get_distinct_anchors() -> None:
    # thread-0 and thread-2 are both throne-room; their anchors must differ so
    # the huddles don't overlap.
    script = to_episode_script(_chronicle())
    by_id = {t["id"]: t for t in script["threads"]}
    assert by_id["thread-0"]["anchor"] != by_id["thread-2"]["anchor"]


def test_script_passes_through_learning() -> None:
    script = to_episode_script(_chronicle())
    assert "driveTrajectory" in script["learning"]
    assert "reflections" in script["learning"]


# --- director: ContinuousDirector (stubbed) -------------------------------


class _StubDrives:
    def __init__(self, values: dict[str, float]) -> None:
        self.values = values


class _StubLord:
    def __init__(self, key: str) -> None:
        class _G:
            pass

        self.genome = _G()
        self.genome.name = key.replace("_", " ").title()
        self.genome.key = key
        self.drives = _StubDrives({"power": 50.0, "honor": 40.0})

    def reflect(self, trigger, digest):
        return Reflection(summary=f"{self.genome.name} learned something.", rules=(), relationships={})


def _decision(action: str, target: str | None = None) -> Decision:
    return Decision(
        action=action, target=target, public_stance="p", private_intent="q",
        dialogue=f"line-{action}", thinking="t",
    )


def _stub_council(cast, *, setting, stakes, max_rounds, appraise):
    names = [l.genome.name for l in cast]
    turns = [CouncilTurn(speaker=names[0], round=1, decision=_decision("speak"))]
    appraisals = {
        n: Appraisal(emotion="wary", drive_deltas={"power": 5.0}, memory="m", concepts=())
        for n in names
    }
    return CouncilTranscript(
        setting=setting, stakes=stakes, cast=tuple(names), turns=tuple(turns),
        appraisals=appraisals if appraise else {},
    )


def _roster(*keys: str) -> list[dict]:
    return [{"key": k, "name": k.title(), "title": ""} for k in keys]


def _locations() -> list[dict]:
    return [{"id": "throne-room", "label": "Throne Room"}, {"id": "wall", "label": "The Wall"}]


def _patch(monkeypatch, plans_by_phase, captured):
    monkeypatch.setattr(cd.Lord, "load", classmethod(lambda cls, key, at_time=None: _StubLord(key)))
    monkeypatch.setattr(cd, "run_council", _stub_council)

    def fake_plan_phase(premise, roster, *, locations, character_locations, phase_index, total_phases, prior_digest=None, **kw):
        captured.append({"phase": phase_index, "where": dict(character_locations), "digest": prior_digest})
        return plans_by_phase[phase_index]

    monkeypatch.setattr(cd, "plan_phase", fake_plan_phase)


def test_director_tracks_character_locations_across_phases(monkeypatch) -> None:
    plans_by_phase = {
        0: [PhaseThread(cast=("cersei", "tyrion", "ned"), setting="council", stakes="x", mood="tense", location="throne-room")],
        1: [
            PhaseThread(cast=("tyrion", "jon"), setting="wall", stakes="y", mood="friendly", location="wall"),
            PhaseThread(cast=("cersei", "jaime"), setting="dais", stakes="z", mood="hostile", location="throne-room"),
        ],
    }
    captured: list[dict] = []
    _patch(monkeypatch, plans_by_phase, captured)

    chronicle = cd.ContinuousDirector(
        "p", _roster("cersei", "tyrion", "ned", "jon", "jaime"),
        episode="s1e7", locations=_locations(), num_phases=2, ledger=[],
    ).run()

    # Phase 1 planner sees Tyrion now at the throne room (from phase 0).
    assert captured[1]["where"]["tyrion"] == "throne-room"
    # After phase 1, the chronicle records Tyrion's wall thread.
    threads = chronicle["threads"]
    wall = [t for t in threads if t["location"] == "wall"]
    assert wall and "tyrion" in wall[0]["cast"]


def test_director_captures_learning(monkeypatch) -> None:
    plans_by_phase = {
        0: [PhaseThread(cast=("cersei", "tyrion"), setting="s", stakes="x", mood="tense", location="throne-room")],
    }
    captured: list[dict] = []
    _patch(monkeypatch, plans_by_phase, captured)

    chronicle = cd.ContinuousDirector(
        "p", _roster("cersei", "tyrion"), episode="s1e7", locations=_locations(), num_phases=1, ledger=[],
    ).run()

    # Per-thread drive deltas + emotion captured.
    t0 = chronicle["threads"][0]
    assert t0["driveDeltas"]["cersei"]["power"] == 5.0
    assert t0["emotion"]["cersei"] == "wary"
    # Drive trajectory recorded per character.
    assert "cersei" in chronicle["learning"]["driveTrajectory"]
    # Reflections produced at episode end.
    assert chronicle["learning"]["reflections"]


def test_director_chronicle_renders_to_episode_script(monkeypatch) -> None:
    plans_by_phase = {
        0: [PhaseThread(cast=("cersei", "tyrion"), setting="the throne room", stakes="x", mood="tense", location="throne-room")],
        1: [PhaseThread(cast=("tyrion", "jon"), setting="the Wall", stakes="y", mood="friendly", location="wall")],
    }
    captured: list[dict] = []
    _patch(monkeypatch, plans_by_phase, captured)

    chronicle = cd.ContinuousDirector(
        "p", _roster("cersei", "tyrion", "jon"), episode="s1e7", locations=_locations(), num_phases=2, ledger=[],
    ).run()
    script = to_episode_script(chronicle)

    assert script["version"] == 2
    by_id = {t["id"]: t for t in script["threads"]}
    # Tyrion's wall thread depends on his throne-room thread (he walked over).
    wall = [t for t in script["threads"] if t["locationId"] == "wall"][0]
    assert wall["dependsOn"] == ["thread-0"]
