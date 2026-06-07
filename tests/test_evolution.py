"""Pure-logic tests for the evolution operators (no LLM)."""

from __future__ import annotations

from got_agents.characters import get_character
from got_agents.training import reflexion
from got_agents.training.evolution import train_character
from got_agents.training.fidelity_eval import GenomeFidelity, ProbeResult


def _fidelity(mean: float, gen: int = 0, weak_cue: str = "x") -> GenomeFidelity:
    return GenomeFidelity(
        character="cersei",
        generation=gen,
        mean=mean,
        violation_rate=0.0,
        results=(
            ProbeResult(cue=weak_cue, line="meh", score=mean - 0.2, violation=False, rationale="flat"),
            ProbeResult(cue="y", line="ok", score=mean + 0.1, violation=False, rationale="ok"),
        ),
    )


def test_reflexion_dedups_rules() -> None:
    out = reflexion._dedup(("Be cold.", "be cold.", "Show no fear.", "Be cold."))
    assert out == ("Be cold.", "Show no fear.")


def test_apply_reflection_appends_and_bumps_generation(monkeypatch) -> None:
    base = get_character("cersei").genome
    monkeypatch.setattr(reflexion, "reflect_rules", lambda g, f: ("answer threats with colder menace",))
    out = reflexion.apply_reflection(base, _fidelity(0.8))
    assert out.generation == base.generation + 1
    assert "answer threats with colder menace" in out.reflection_rules


def test_apply_reflection_without_rules_still_advances(monkeypatch) -> None:
    base = get_character("ned").genome
    monkeypatch.setattr(reflexion, "reflect_rules", lambda g, f: ())
    out = reflexion.apply_reflection(base, _fidelity(0.8))
    assert out.generation == base.generation + 1
    assert out.reflection_rules == base.reflection_rules


def test_train_is_elitist_keeps_best(monkeypatch) -> None:
    # Stub eval: gen-0 = 0.80, any reflected/opro candidate = 0.70 (worse).
    import got_agents.training.evolution as evo

    scores = {0: 0.80}

    def fake_eval(genome, *, character=None, log_to_weave=True):
        return _fidelity(scores.get(genome.generation, 0.70), gen=genome.generation)

    monkeypatch.setattr(evo, "evaluate_genome", fake_eval)
    monkeypatch.setattr(evo, "apply_reflection", lambda g, f: g.evolved(generation=g.generation + 1))
    monkeypatch.setattr(evo, "save_genome", lambda g: None)

    run = train_character(
        get_character("cersei").genome,
        generations=1,
        use_reflexion=True,
        use_opro=False,
        save=False,
        eval_mode="probes",
    )
    # Best stays gen-0 (0.80) because the candidate (0.70) is worse.
    assert run.best_fidelity.mean == 0.80
    assert len(run.history) == 2
    assert run.history[0].mean == 0.80


def test_train_records_trajectory_and_delta(monkeypatch) -> None:
    import got_agents.training.evolution as evo

    # gen-0 = 0.70, candidate improves to 0.85.
    def fake_eval(genome, *, character=None, log_to_weave=True):
        return _fidelity(0.70 if genome.generation == 0 else 0.85, gen=genome.generation)

    monkeypatch.setattr(evo, "evaluate_genome", fake_eval)
    monkeypatch.setattr(evo, "apply_reflection", lambda g, f: g.evolved(generation=g.generation + 1))
    monkeypatch.setattr(evo, "save_genome", lambda g: None)

    run = train_character(
        get_character("cersei").genome,
        generations=1,
        use_reflexion=True,
        use_opro=False,
        save=False,
        eval_mode="probes",
    )
    assert run.delta > 0.0
    assert run.best_fidelity.mean == 0.85
