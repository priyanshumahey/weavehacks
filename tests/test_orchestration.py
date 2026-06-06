"""Pure-logic tests for Step 3: action resolution + the Director spine.

No Redis or OpenAI — these exercise the deterministic world mutation and the
Director's scene scheduling with stubbed Lords/flows.
"""

from __future__ import annotations

from got_agents.agent.types import Decision
from got_agents.orchestration import load_skeleton
from got_agents.world import fold, load_ledger, resolve
from got_agents.world.types import WorldSnapshot


def _decision(action: str, target: str | None = None, **kw) -> Decision:
    return Decision(
        action=action,
        target=target,
        public_stance=kw.get("public", ""),
        private_intent=kw.get("private", ""),
        dialogue=kw.get("dialogue", "..."),
        thinking="",
    )


# --- WorldSnapshot.apply (shared mutation) --------------------------------


def test_snapshot_apply_mirrors_fold() -> None:
    world = WorldSnapshot(point="s1e1")
    world.apply({"op": "kill", "who": "jon arryn"})
    world.apply({"op": "title", "who": "eddard stark", "title": "Hand"})
    world.apply({"op": "ally", "who": ["a", "b"]})
    assert not world.is_alive("jon arryn")
    assert world.titles["eddard stark"] == "Hand"
    assert frozenset({"a", "b"}) in world.alliances


# --- resolve(decision) ----------------------------------------------------


def test_resolve_ally_forms_alliance() -> None:
    world = WorldSnapshot(point="s1e1")
    effects = resolve(_decision("ally", "Littlefinger"), "Cersei Lannister", world)
    assert effects == [{"op": "ally", "who": ["cersei lannister", "littlefinger"]}]
    assert frozenset({"cersei lannister", "littlefinger"}) in world.alliances


def test_resolve_swear_oath_records_oath() -> None:
    world = WorldSnapshot(point="s1e1")
    resolve(
        _decision("swear_oath", "Robert", public="serve as Hand"),
        "Eddard Stark",
        world,
    )
    assert any(
        o.by == "eddard stark" and o.to == "robert" and o.terms == "serve as Hand"
        for o in world.oaths
    )


def test_resolve_share_secret_reveals_existing_secret() -> None:
    world = WorldSnapshot(point="s1e1")
    world.apply(
        {"op": "secret", "secret": "parentage", "fact": "...",
         "known_to": ["cersei lannister"]}
    )
    resolve(_decision("share_secret", "Jaime"), "Cersei Lannister", world)
    assert world.knows("jaime", "parentage")


def test_resolve_share_secret_registers_new_pact_when_none_held() -> None:
    world = WorldSnapshot(point="s1e1")
    effects = resolve(
        _decision("share_secret", "Cersei", private="I will betray Ned"),
        "Littlefinger",
        world,
    )
    assert len(effects) == 1 and effects[0]["op"] == "secret"
    sid = effects[0]["secret"]
    assert world.knows("littlefinger", sid)
    assert world.knows("cersei", sid)


def test_resolve_speak_and_pass_change_nothing() -> None:
    world = WorldSnapshot(point="s1e1")
    assert resolve(_decision("speak", "Ned"), "Cersei Lannister", world) == []
    assert resolve(_decision("pass"), "Cersei Lannister", world) == []
    assert not world.alliances and not world.oaths and not world.secrets


# --- skeleton loading -----------------------------------------------------


def test_s1e1_skeleton_loads_with_beats() -> None:
    skel = load_skeleton("s1e1")
    assert skel.episode == "s1e1"
    assert len(skel.beats) >= 1
    first = skel.beats[0]
    assert first.cast and first.setting and first.stakes


# --- Director (stubbed flow, no LLM) --------------------------------------


def test_director_runs_beats_and_mutates_world(monkeypatch) -> None:
    import got_agents.orchestration.director as director_mod
    from got_agents.flows.council import CouncilTranscript, CouncilTurn
    from got_agents.orchestration import Beat, EpisodeSkeleton

    # Stub Lord.load so no Redis/LLM is touched.
    class _StubLord:
        def __init__(self, key: str) -> None:
            class _G:
                name = key
            self.genome = _G()

    monkeypatch.setattr(
        director_mod.Lord, "load", classmethod(lambda cls, key, at_time=None: _StubLord(key))
    )

    # Stub run_council to return a transcript where 'a' allies with 'b'.
    def _fake_council(cast, *, setting, stakes, max_rounds, appraise):
        turn = CouncilTurn(
            speaker="a", round=1,
            decision=_decision("ally", "b", dialogue="Together, then."),
        )
        return CouncilTranscript(
            setting=setting, stakes=stakes,
            cast=tuple(c.genome.name for c in cast),
            turns=(turn,), appraisals={},
        )

    monkeypatch.setattr(director_mod, "run_council", _fake_council)

    skeleton = EpisodeSkeleton(
        episode="s1e1", title="t",
        beats=(Beat(setting="x", stakes="y", cast=("a", "b"), max_rounds=1),),
    )
    result = director_mod.run_episode(skeleton, ledger=[], appraise=False, reflect=False)

    assert len(result.scenes) == 1
    scene = result.scenes[0]
    assert scene.effects == ({"op": "ally", "who": ["a", "b"]},)
    # The episode-end world reflects the resolved alliance; the start does not.
    assert frozenset({"a", "b"}) in result.world_end.alliances
    assert frozenset({"a", "b"}) not in result.world_start.alliances


def test_director_uses_real_s1e1_ledger_for_world_start() -> None:
    # Fold-only check (no scenes run): world_start should match fold at the point.
    from got_agents.orchestration import Director, EpisodeSkeleton

    skel = EpisodeSkeleton(episode="s1e1", title="t", beats=())
    result = Director(skel, ledger=load_ledger(["s1e1"]), appraise=False, reflect=False).run()
    expected = fold(load_ledger(["s1e1"]), "s1e1")
    assert result.world_end.titles == expected.titles
    assert result.world_end.dead == expected.dead
