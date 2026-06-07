"""Training (L5) — the evolutionary fidelity loop (PART C).

Reads/writes genome artifacts and runs Weave evaluations; depends only downward
on ``agent``/``characters``/``infra``. Nothing in the engine imports this.
"""

from got_agents.training.ablation import blank_genome, generic_genome
from got_agents.training.batch import (
    CharacterResult,
    select_cast,
    train_many,
    train_one,
)
from got_agents.training.character_model import CharacterModel
from got_agents.training.evolution import Generation, TrainingRun, train_character
from got_agents.training.fidelity_eval import (
    GenomeFidelity,
    ProbeResult,
    evaluate_genome,
    evaluate_reactions,
)
from got_agents.training.genome_io import load_genome, save_genome
from got_agents.training.leaderboard import LeaderboardResult, publish_leaderboard
from got_agents.training.opro import optimize_persona
from got_agents.training.reflexion import apply_reflection, reflect_rules

__all__ = [
    "CharacterModel",
    "CharacterResult",
    "Generation",
    "GenomeFidelity",
    "LeaderboardResult",
    "ProbeResult",
    "TrainingRun",
    "apply_reflection",
    "blank_genome",
    "evaluate_genome",
    "evaluate_reactions",
    "generic_genome",
    "load_genome",
    "optimize_persona",
    "publish_leaderboard",
    "reflect_rules",
    "save_genome",
    "select_cast",
    "train_character",
    "train_many",
    "train_one",
]
