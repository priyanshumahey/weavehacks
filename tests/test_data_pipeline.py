"""Pure-logic tests for the author-phase pipelines (no LLM, no Redis).

Exercises tiering over the real CSV and the schema-parsing of both pipelines'
LLM outputs (robustness to messy model JSON).
"""

from __future__ import annotations

from got_agents.cognition import canon_time
from got_agents.cognition.drives import DRIVES
from got_agents.data_pipeline import cores, ledger_extract, sources


# --- sources --------------------------------------------------------------


def test_tiers_reflect_line_counts() -> None:
    # Ned and Cersei are major speakers; a one-line extra is a stub.
    assert sources.tier_of("eddard stark") == "full"
    assert sources.tier_of("cersei lannister") == "full"
    assert sources.tier_of("a voice") == "stub"


def test_s1e1_speaker_roster_is_nonempty() -> None:
    roster = sources.speakers_in_episode("s1e1")
    assert roster["eddard stark"] > roster["arya stark"]
    assert "tyrion lannister" in roster


def test_lines_up_to_horizon_excludes_future_episodes() -> None:
    early = sources.lines_for_speaker("tyrion lannister", up_to="s1e1")
    allof = sources.lines_for_speaker("tyrion lannister")
    assert 0 < len(early) <= len(allof)
    assert all(canon_time.code(ln.point) <= canon_time.code("s1e1") for ln in early)


# --- cores._parse ---------------------------------------------------------


def test_core_parse_fills_all_drives_and_clamps() -> None:
    raw = {
        "name": "Eddard Stark",
        "title": "Lord of Winterfell",
        "self_persona": "An honorable man.",
        "life_motive": "Duty and family.",
        "voice_anchors": ["Winter is coming."],
        "fixed_bag": ["Honor", "Family", "Duty"],
        "drive_params": {"honor": 99, "power": "oops"},  # partial + bad value
        "seeds": [
            {"text": "I executed a deserter.", "importance": 1.4,
             "concepts": ["Honor"], "point": "s1e1"},
            {"bad": "no text"},
        ],
    }
    core = cores._parse("eddard stark", raw)
    assert core.key == "eddard_stark"
    assert set(core.genome.drive_params) == set(DRIVES)  # every drive present
    assert core.genome.drive_params["power"] == 50.0  # bad value -> default
    assert core.genome.fixed_bag == ("honor", "family", "duty")  # lowercased
    assert len(core.seeds) == 1  # textless seed dropped
    assert core.seeds[0].importance == 1.0  # clamped to [0,1]


def test_core_seed_timestamps_track_canon_point() -> None:
    raw = {
        "name": "X", "drive_params": {}, "fixed_bag": [],
        "seeds": [
            {"text": "backstory fact", "importance": 0.5, "point": "backstory"},
            {"text": "learned in e3", "importance": 0.5, "point": "s1e3"},
        ],
    }
    core = cores._parse("x", raw)
    mems = core.seed_memories()
    assert mems[0].timestamp == canon_time.backstory_timestamp()
    assert mems[1].timestamp == canon_time.to_timestamp("s1e3")
    assert mems[1].timestamp > mems[0].timestamp


def test_core_roundtrips_through_dict() -> None:
    raw = {
        "name": "Cersei", "title": "Queen", "self_persona": "Lioness.",
        "life_motive": "Protect my children.", "voice_anchors": ["Power is power."],
        "fixed_bag": ["power", "family"], "drive_params": {}, "seeds": [],
    }
    core = cores._parse("cersei lannister", raw)
    again = cores.AuthoredCore.from_dict(core.to_dict())
    assert again.genome == core.genome
    assert again.tier == core.tier


# --- ledger_extract._parse ------------------------------------------------


def test_ledger_parse_drops_unknown_effect_ops() -> None:
    raw = {
        "events": [
            {
                "id": "s1e2-a", "point": "s1e2", "order": 1, "type": "death",
                "summary": "Someone dies.", "participants": ["Foo"],
                "effects": [
                    {"op": "kill", "who": "foo"},
                    {"op": "teleport", "who": "foo"},  # not in EFFECT_OPS
                ],
            },
        ]
    }
    events = ledger_extract._parse("s1e2", raw)
    assert len(events) == 1
    assert events[0].effects == ({"op": "kill", "who": "foo"},)
    assert events[0].participants == ("foo",)  # lowercased


def test_ledger_parse_sorts_by_canon_order() -> None:
    raw = {
        "events": [
            {"id": "b", "point": "s1e2", "order": 5, "summary": "later"},
            {"id": "a", "point": "s1e2", "order": 1, "summary": "earlier"},
        ]
    }
    events = ledger_extract._parse("s1e2", raw)
    assert [e.id for e in events] == ["a", "b"]
