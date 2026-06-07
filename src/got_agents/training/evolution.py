"""Evolution driver (PART C.1) — the outer training loop.

Runs N generations for one character with a proper **train/test split**:
  TRAIN (Season 1): Reflexion mines rules + OPRO mutates the persona, both
    optimizing on S1 scenes the operators are allowed to see.
  TEST (Season 2): the reported fitness — unseen future scenes. A climb on TEST
    is real generalization, not overfitting the measurement (PART C.6).

Selection (elitist keep-best) is on the TRAIN signal; the headline metric is
TEST. Every generation records both so you can watch train *and* test move.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import weave

from got_agents.agent.genome import Genome
from got_agents.training.fidelity_eval import (
    GenomeFidelity,
    evaluate_genome,
    evaluate_reactions,
)
from got_agents.training.genome_io import save_genome
from got_agents.training.opro import optimize_persona
from got_agents.training.reflexion import apply_reflection
from got_agents.training.splits import TEST_EPISODES, TRAIN_EPISODES, VAL_EPISODES


@dataclass(frozen=True, slots=True)
class Generation:
    generation: int
    mean: float  # TRAIN fidelity (what the operators optimized)
    violation_rate: float
    test_mean: float = 0.0  # TEST fidelity (unseen S2 — the honest headline)
    val_mean: float = 0.0  # VAL fidelity (held-out S1 — model selection)


@dataclass(slots=True)
class TrainingRun:
    character: str
    history: list[Generation] = field(default_factory=list)
    genomes: list[Genome] = field(default_factory=list)
    best_genome: Genome | None = None
    best_fidelity: GenomeFidelity | None = None

    @property
    def delta(self) -> float:
        """Train-split improvement (operators' objective)."""
        if len(self.history) < 2:
            return 0.0
        return self.history[-1].mean - self.history[0].mean

    @property
    def test_delta(self) -> float:
        """TEST-split improvement (generalization to unseen future scenes)."""
        if len(self.history) < 2:
            return 0.0
        return self.history[-1].test_mean - self.history[0].test_mean


@weave.op
def train_character(
    genome: Genome,
    *,
    generations: int = 1,
    use_reflexion: bool = True,
    use_opro: bool = True,
    save: bool = True,
    eval_mode: str = "reactions",
    speaker_csv_name: str | None = None,
) -> TrainingRun:
    """Evolve ``genome`` with a train/val/test split; return the trajectory.

    ``eval_mode``: ``"reactions"`` (real scenes, the strong eval) uses the
    three-way S1-train / S1-val / S2-test split; ``"probes"`` (the legacy cue
    probes) has no split. The operators optimize the TRAIN signal, candidates are
    *selected* on the held-out VAL slice, and the reported headline is the TEST
    (unseen-season) score — never touched by any operator or selection step.
    """
    char = genome.key
    reactions = eval_mode == "reactions"

    def _train_score(g: Genome) -> GenomeFidelity:
        if reactions:
            return evaluate_reactions(
                g, character=char, episodes=TRAIN_EPISODES,
                speaker_csv_name=speaker_csv_name,
            )
        return evaluate_genome(g, character=char)

    def _val_score(g: Genome, train_f: GenomeFidelity) -> float:
        # Reactions: select on the held-out S1 VAL slice the operators never
        # optimized. Probes (no split): fall back to the train fidelity mean so
        # elitist keep-best still works.
        if not reactions:
            return train_f.mean
        return evaluate_reactions(
            g, character=char, episodes=VAL_EPISODES,
            speaker_csv_name=speaker_csv_name,
        ).mean

    def _test_score(g: Genome) -> float:
        if not reactions:
            return 0.0
        return evaluate_reactions(
            g, character=char, episodes=TEST_EPISODES,
            speaker_csv_name=speaker_csv_name,
        ).mean

    run = TrainingRun(character=char)
    best_val = -1.0

    def _record(g: Genome, train_f: GenomeFidelity, val: float) -> None:
        run.history.append(
            Generation(
                g.generation, train_f.mean, train_f.violation_rate,
                test_mean=_test_score(g), val_mean=val,
            )
        )
        run.genomes.append(g)
        if save:
            save_genome(g)

    # gen-0 baseline.
    current = genome
    fidelity = _train_score(current)
    base_val = _val_score(current, fidelity)
    run.best_genome = current
    run.best_fidelity = fidelity
    best_val = base_val
    _record(current, fidelity, base_val)

    for _ in range(generations):
        # 1. Reflexion: mine rules from the current best's weak TRAIN scenes.
        candidate = current
        candidate_fidelity = fidelity
        if use_reflexion:
            candidate = apply_reflection(run.best_genome, run.best_fidelity)
            candidate_fidelity = _train_score(candidate)
        else:
            candidate = run.best_genome.evolved(generation=run.best_genome.generation + 1)
            candidate_fidelity = run.best_fidelity

        # 2. OPRO: mutate the persona, proposing against the TRAIN signal.
        if use_opro:
            opro = optimize_persona(
                candidate, candidate_fidelity, character=char, evaluator=_train_score
            )
            candidate = opro.genome
            candidate_fidelity = opro.fidelity

        # 3. Elitist selection on the held-out VAL slice — keep a candidate only
        #    if it improves a signal the operators never optimized directly.
        candidate_val = _val_score(candidate, candidate_fidelity)
        if candidate_val >= best_val:
            run.best_genome = candidate
            run.best_fidelity = candidate_fidelity
            best_val = candidate_val

        current = candidate
        fidelity = candidate_fidelity
        _record(candidate, candidate_fidelity, candidate_val)

    return run


# Re-export for callers/tests.
_Evaluator = Callable[[Genome], GenomeFidelity]
