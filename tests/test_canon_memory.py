"""Pure-logic tests for the ledger->memory bridge (membership + canon dating).

No Redis or OpenAI — exercises recipient resolution, visibility filtering,
concept grounding, and canon-dated memory construction on the helper functions.
"""

from __future__ import annotations

from got_agents.cognition import canon_time
from got_agents.data_pipeline import canon_memory
from got_agents.world.types import LedgerEvent


def _public(participants=(), point="s1e1", type="title") -> LedgerEvent:
    return LedgerEvent(
        id=f"{point}-{type}", point=point, type=type,
        summary="Eddard Stark is named Hand of the King.",
        participants=tuple(participants), visibility="public",
    )


def _secret(known_to=(), point="s1e1") -> LedgerEvent:
    return LedgerEvent(
        id=f"{point}-secret", point=point, type="secret",
        summary="Cersei's children are Jaime's, not Robert's.",
        visibility="secret", known_to=tuple(known_to),
    )


def test_resolve_key_maps_full_names() -> None:
    assert canon_memory._resolve_key("cersei lannister") == "cersei"
    assert canon_memory._resolve_key("eddard stark") == "ned"
    assert canon_memory._resolve_key("jon arryn") is None  # no core


def test_public_event_reaches_audience_and_participants() -> None:
    audience = {"cersei", "ned"}
    recipients = canon_memory._recipients(_public(participants=["robert baratheon"]), audience)
    # Everyone present learns a public event; robert has no core so is dropped.
    assert recipients == {"cersei", "ned"}


def test_secret_event_reaches_only_known_to() -> None:
    audience = {"cersei", "ned"}
    event = _secret(known_to=["cersei lannister", "jaime lannister", "bran stark"])
    recipients = canon_memory._recipients(event, audience)
    # Only loadable known_to members; Ned is present but NOT entitled to the secret.
    assert recipients == {"cersei"}
    assert "ned" not in recipients


def test_canon_memory_is_dated_to_the_event_point() -> None:
    event = _public(point="s1e3")
    mem = canon_memory._memory_for(event, "ned", ("honor", "duty"))
    assert mem.timestamp == canon_time.to_timestamp("s1e3")
    assert mem.id == "ned:ledger:s1e3-title"
    assert mem.importance == 0.6  # title weight


def test_concepts_ground_in_fixed_bag_overlap() -> None:
    # summary mentions "hand"/"king"; fixed bag overlaps surface as concepts.
    event = _public(type="title")
    mem = canon_memory._memory_for(event, "ned", ("king", "honor", "stark"))
    assert mem.concepts[0] == "title"  # event type always first
    assert "king" in mem.concepts  # appears in summary
    assert "stark" in mem.concepts  # "Stark" appears in summary
    assert "honor" not in mem.concepts  # not in the summary text


def test_importance_table_covers_kinds() -> None:
    assert canon_memory._IMPORTANCE["secret"] > canon_memory._IMPORTANCE["title"]
    assert canon_memory._IMPORTANCE["death"] > canon_memory._DEFAULT_IMPORTANCE


def test_audience_defaults_to_episode_speakers() -> None:
    # S1E1's loadable speakers are Ned and Cersei; Stannis/Littlefinger were
    # not present that episode, so they are NOT in the default audience.
    keys = canon_memory._audience_keys("s1e1", None)
    assert "ned" in keys
    assert "cersei" in keys
    assert "stannis" not in keys
    assert "littlefinger" not in keys


def test_audience_override_resolves_names() -> None:
    keys = canon_memory._audience_keys("s1e1", ["Eddard Stark", "Cersei Lannister", "Nobody"])
    assert keys == {"ned", "cersei"}
