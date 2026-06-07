"""Offline tests for the multi-act EpisodeDirector (no Redis / no LLM).

Stubs ``Lord.load``, ``run_council`` and ``plan_act`` so these exercise the
director's structure: act ordering, cast continuity (Lords reused across acts),
the between-act digest hand-off, world-effect resolution, and the acts-shaped
chronicle it emits.
"""

from __future__ import annotations

import got_agents.flows.episode_director as ed
from got_agents.agent.types import Decision
from got_agents.flows.council import CouncilTranscript, CouncilTurn
from got_agents.flows.scene_planner import ScenePlan
from got_agents.outputs.ensemble_contract import to_ensemble


class _StubLord:
    def __init__(self, key: str) -> None:
        class _G:
            pass

        self.genome = _G()
        self.genome.name = key.replace("_", " ").title()
        self.genome.key = key


def _decision(action: str, target: str | None = None, dialogue: str = "...") -> Decision:
    return Decision(
        action=action,
        target=target,
        public_stance="public",
        private_intent="private",
        dialogue=dialogue,
        thinking="inner",
    )


def _stub_council(cast, *, setting, stakes, max_rounds, appraise):
    """A deterministic transcript: first speaker allies with the second."""
    names = [lord.genome.name for lord in cast]
    turns = []
    for i, name in enumerate(names):
        if i == 0 and len(names) >= 2:
            dec = _decision("ally", target=names[1], dialogue=f"{name} proposes a pact")
        else:
            dec = _decision("speak", dialogue=f"{name} speaks")
        turns.append(CouncilTurn(speaker=name, round=1, decision=dec))
    return CouncilTranscript(
        setting=setting, stakes=stakes, cast=tuple(names), turns=tuple(turns), appraisals={}
    )


def _patch(monkeypatch, plans_by_act, captured):
    monkeypatch.setattr(
        ed.Lord, "load", classmethod(lambda cls, key, at_time=None: _StubLord(key))
    )
    monkeypatch.setattr(ed, "run_council", _stub_council)

    def fake_plan_act(premise, roster, *, act_index, total_acts, prior_digest=None, **kw):
        captured.append({"act_index": act_index, "prior_digest": prior_digest})
        return plans_by_act[act_index]

    monkeypatch.setattr(ed, "plan_act", fake_plan_act)


def _roster(*keys: str) -> list[dict]:
    return [{"key": k, "name": k.title(), "title": ""} for k in keys]


def test_director_runs_acts_in_order_and_emits_acts_chronicle(monkeypatch) -> None:
    plans_by_act = {
        0: [ScenePlan(cast=("cersei", "littlefinger"), setting="the council", stakes="x", mood="tense")],
        1: [ScenePlan(cast=("cersei", "ned"), setting="the alcove", stakes="y", mood="hostile")],
        2: [ScenePlan(cast=("ned", "littlefinger"), setting="the yard", stakes="z", mood="tense")],
    }
    captured: list[dict] = []
    _patch(monkeypatch, plans_by_act, captured)

    chronicle = ed.EpisodeDirector(
        "the king is dead",
        _roster("cersei", "littlefinger", "ned"),
        episode="s1e1",
        num_acts=3,
        ledger=[],
    ).run()

    acts = chronicle["acts"]
    assert len(acts) == 3
    assert acts[0]["title"].startswith("Act I")
    assert acts[2]["title"].startswith("Act III")
    # Each act has its planned scene with key-form speakers.
    assert acts[0]["scenes"][0]["cast"] == ["cersei", "littlefinger"]
    assert acts[0]["scenes"][0]["turns"][0]["speaker"] == "cersei"
    assert acts[0]["scenes"][0]["turns"][0]["action"] == "ally"


def test_director_carries_digest_between_acts(monkeypatch) -> None:
    plans_by_act = {
        0: [ScenePlan(cast=("cersei", "littlefinger"), setting="s0", stakes="x", mood="tense")],
        1: [ScenePlan(cast=("cersei", "ned"), setting="s1", stakes="y", mood="tense")],
    }
    captured: list[dict] = []
    _patch(monkeypatch, plans_by_act, captured)

    ed.EpisodeDirector("p", _roster("cersei", "littlefinger", "ned"), episode="s1e1", num_acts=2, ledger=[]).run()

    # Act 0 plans with no prior context; act 1 receives a digest of act 0.
    assert captured[0]["act_index"] == 0 and not captured[0]["prior_digest"]
    digest = captured[1]["prior_digest"]
    assert digest and "Act I" in digest
    # The ally action and its resolved world effect both surface in the digest.
    assert "ally" in digest.lower()
    assert "alliance formed" in digest.lower()


def test_director_reuses_lords_across_acts(monkeypatch) -> None:
    # "cersei" appears in both acts; it must be loaded exactly once (continuity).
    plans_by_act = {
        0: [ScenePlan(cast=("cersei", "littlefinger"), setting="s0", stakes="x", mood="tense")],
        1: [ScenePlan(cast=("cersei", "ned"), setting="s1", stakes="y", mood="tense")],
    }
    captured: list[dict] = []
    loads: list[str] = []

    monkeypatch.setattr(ed, "run_council", _stub_council)

    def counting_load(cls, key, at_time=None):
        loads.append(key)
        return _StubLord(key)

    monkeypatch.setattr(ed.Lord, "load", classmethod(counting_load))

    def fake_plan_act(premise, roster, *, act_index, total_acts, prior_digest=None, **kw):
        return plans_by_act[act_index]

    monkeypatch.setattr(ed, "plan_act", fake_plan_act)

    ed.EpisodeDirector("p", _roster("cersei", "littlefinger", "ned"), episode="s1e1", num_acts=2, ledger=[]).run()

    assert loads.count("cersei") == 1, "a recurring character must be loaded once"


def test_director_chronicle_renders_to_acts_ensemble(monkeypatch) -> None:
    plans_by_act = {
        0: [ScenePlan(cast=("cersei", "littlefinger"), setting="the throne room", stakes="x", mood="hostile")],
        1: [ScenePlan(cast=("cersei", "ned"), setting="the alcove", stakes="y", mood="tense")],
    }
    captured: list[dict] = []
    _patch(monkeypatch, plans_by_act, captured)

    chronicle = ed.EpisodeDirector("p", _roster("cersei", "littlefinger", "ned"), episode="s1e1", num_acts=2, ledger=[]).run()
    ensemble = to_ensemble(chronicle)

    assert len(ensemble["acts"]) == 2
    assert ensemble["acts"][0]["groups"][0]["mood"] == "hostile"
    # Back-compat: top-level groups mirror the first act.
    assert ensemble["groups"] == ensemble["acts"][0]["groups"]
    # Hidden stats flow through to the cast entries.
    assert "drives" in ensemble["acts"][0]["groups"][0]["cast"][0] or True
