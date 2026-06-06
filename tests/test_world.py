"""Pure-logic tests for the Step-2 world layer: canon time + fold.

No Redis or OpenAI needed — these exercise the deterministic timeline axis and
the ``fold(ledger, T)`` pure function.
"""

from __future__ import annotations

import pytest

from got_agents.cognition import canon_time
from got_agents.world import LedgerEvent, fold

# --- canon_time -----------------------------------------------------------


def test_code_parses_all_story_point_forms() -> None:
    assert canon_time.code("s1e5") == 105
    assert canon_time.code("S1E5") == 105
    assert canon_time.code((1, 5)) == 105
    assert canon_time.code(105) == 105


def test_code_is_monotonic_across_the_series() -> None:
    assert canon_time.code("s1e1") < canon_time.code("s1e10")
    assert canon_time.code("s1e10") < canon_time.code("s2e1")
    assert canon_time.code("s7e7") < canon_time.code("s8e1")


def test_timestamps_are_monotonic_and_below_wall_clock() -> None:
    import time

    assert canon_time.to_timestamp("s1e1") < canon_time.to_timestamp("s1e2")
    assert canon_time.to_timestamp("s8e6") < time.time()
    # backstory predates the first episode -> within any horizon
    assert canon_time.backstory_timestamp() <= canon_time.to_timestamp("s1e1")


def test_label_roundtrips() -> None:
    assert canon_time.label("s3e9") == "s3e9"
    assert canon_time.label((3, 9)) == "s3e9"


def test_code_rejects_garbage() -> None:
    with pytest.raises(ValueError):
        canon_time.code("the red wedding")


# --- fold -----------------------------------------------------------------


def _ledger() -> list[LedgerEvent]:
    return [
        LedgerEvent(
            id="jon-arryn-dies",
            point="s1e1",
            type="death",
            summary="Jon Arryn, Hand of the King, dies.",
            participants=("jon arryn",),
            effects=({"op": "kill", "who": "jon arryn"},),
        ),
        LedgerEvent(
            id="ned-made-hand",
            point="s1e2",
            type="title",
            summary="Eddard Stark is named Hand of the King.",
            participants=("eddard stark",),
            effects=(
                {"op": "title", "who": "eddard stark", "title": "Hand of the King"},
                {"op": "oath", "by": "eddard stark", "to": "robert baratheon",
                 "terms": "serve as Hand"},
            ),
        ),
        LedgerEvent(
            id="parentage-secret",
            point="s1e1",
            type="secret",
            summary="Cersei's children are Jaime's, not Robert's.",
            visibility="secret",
            known_to=("cersei lannister", "jaime lannister"),
            effects=(
                {"op": "secret", "secret": "twincest", "fact": "children are Jaime's",
                 "known_to": ["cersei lannister", "jaime lannister"]},
            ),
        ),
        LedgerEvent(
            id="ned-learns",
            point="s1e7",
            type="reveal",
            summary="Ned uncovers the truth of the children's parentage.",
            visibility="secret",
            effects=({"op": "learn", "secret": "twincest", "who": "eddard stark"},),
        ),
        LedgerEvent(
            id="robert-dies",
            point="s1e7",
            type="death",
            summary="King Robert dies of a hunting wound.",
            participants=("robert baratheon",),
            effects=({"op": "kill", "who": "robert baratheon"},),
        ),
    ]


def test_fold_at_e1_only_applies_e1_events() -> None:
    world = fold(_ledger(), "s1e1")
    assert not world.is_alive("jon arryn")
    assert world.is_alive("robert baratheon")
    assert "eddard stark" not in world.titles  # named Hand in E2
    assert world.knows("cersei lannister", "twincest")
    assert not world.knows("eddard stark", "twincest")


def test_fold_at_e2_adds_title_and_oath() -> None:
    world = fold(_ledger(), "s1e2")
    assert world.titles["eddard stark"] == "Hand of the King"
    assert any(o.by == "eddard stark" and o.to == "robert baratheon"
               for o in world.oaths)


def test_fold_at_e7_reveals_secret_and_kills_robert() -> None:
    world = fold(_ledger(), "s1e7")
    assert world.knows("eddard stark", "twincest")
    assert world.knows("cersei lannister", "twincest")
    assert not world.is_alive("robert baratheon")
    secrets = world.secrets_known_to("eddard stark")
    assert any(s.id == "twincest" for s in secrets)


def test_fold_is_pure_and_order_independent() -> None:
    ledger = _ledger()
    shuffled = list(reversed(ledger))
    assert fold(ledger, "s1e7").titles == fold(shuffled, "s1e7").titles
    assert fold(ledger, "s1e7").dead == fold(shuffled, "s1e7").dead


def test_fold_horizon_excludes_future_secret_knowledge() -> None:
    # As of E6, Ned does not yet know; the same ledger at E7 reveals it.
    assert not fold(_ledger(), "s1e6").knows("eddard stark", "twincest")
    assert fold(_ledger(), "s1e7").knows("eddard stark", "twincest")


# --- the authored S1E1 ledger file ----------------------------------------


def test_authored_s1e1_ledger_folds_to_a_sane_world() -> None:
    from got_agents.world import load_ledger

    ledger = load_ledger(["s1e1"])
    assert ledger, "S1E1 ledger should not be empty"
    world = fold(ledger, "s1e1")

    # Jon Arryn is dead; the Hand's seat passes to Ned with an oath to Robert.
    assert not world.is_alive("jon arryn")
    assert world.titles["eddard stark"] == "Hand of the King"
    assert any(
        o.by == "eddard stark" and o.to == "robert baratheon" for o in world.oaths
    )

    # The royal-parentage secret is held by exactly the right people by end of E1.
    secret = world.secrets["royal-parentage"]
    assert secret.known_to == frozenset(
        {"cersei lannister", "jaime lannister", "jon arryn", "bran stark"}
    )
    assert not world.knows("eddard stark", "royal-parentage")  # Ned learns later

    # Daenerys is wed to Drogo.
    assert any(
        m == frozenset({"daenerys targaryen", "khal drogo"}) for m in world.marriages
    )
