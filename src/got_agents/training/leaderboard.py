"""Weave Leaderboard publisher (PART C.3) — the gen-0 -> gen-N climb on screen.

Binds one **shared** held-out evaluation to every genome generation so Weave can
rank them by mean fidelity. Each generation's :class:`CharacterModel` is run
against the *same* published ``weave.Evaluation`` (same probes, same scorer), and
a ``Leaderboard`` column points at that evaluation's ref. The result is an
automatic on-screen curve: *"the agent got better"* as a tracked metric.

This is the demo money-shot — the genome lineage produced by ``train_character``
(or any list of genomes) becomes a ranked board in the Weave UI.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass

import weave
from weave.flow import leaderboard

from got_agents.agent.genome import Genome
from got_agents.training.character_model import CharacterModel
from got_agents.training.canon_scenes import reaction_probes
from got_agents.training.dataset import probes as get_probes
from got_agents.training.fidelity_eval import DEFAULT_REACTION_EPISODES
from got_agents.training.fidelity_ref import score_line_fidelity
from got_agents.training.reaction_fidelity import score_reaction_scene

_SCORER_NAME = "fidelity_scorer"
_METRIC_PATH = "fidelity.mean"


def fidelity_scorer(character: str, output: str) -> dict:
    """Weave scorer — judge a produced line against fixed canon."""
    result = score_line_fidelity(character, output)
    return {"fidelity": result.score, "violation": int(result.violation)}


def reaction_scorer(character: str, scene: str, gold: str, output: str) -> dict:
    """Weave scorer — judge a reaction against the real canon line in context.

    Named ``reaction_scorer``; the leaderboard column's ``scorer_name`` must
    match this function name for submissions to bind.
    """
    result = score_reaction_scene(scene, character, gold, output)
    return {"fidelity": result.score, "violation": int(not result.matches_intent)}


class _ReactionModel(CharacterModel):
    """A CharacterModel whose ``predict(scene)`` reacts to scene context."""

    @weave.op
    def predict(self, scene: str) -> str:  # type: ignore[override]
        return self.react(scene)


@dataclass(frozen=True, slots=True)
class LeaderboardResult:
    character: str
    evaluation_ref: str
    leaderboard_ref: str
    generations: int


async def _evaluate_all(
    evaluation: weave.Evaluation,
    genomes: list[Genome],
    *,
    reactions: bool,
) -> None:
    for index, genome in enumerate(genomes):
        model_cls = _ReactionModel if reactions else CharacterModel
        model = model_cls.from_genome(genome)
        # Name the model by step + generation so the leaderboard rows are legible
        # and unique even when generation numbers repeat (elitist holds).
        model.name = f"{genome.key}-step{index}-gen{genome.generation}"
        await evaluation.evaluate(model)


def publish_leaderboard(
    character: str,
    genomes: list[Genome],
    *,
    name: str | None = None,
    eval_mode: str = "probes",
) -> LeaderboardResult:
    """Evaluate every genome on the shared backtest and publish a leaderboard.

    ``genomes`` is the generation lineage. ``eval_mode`` is ``"probes"`` (cue
    probes) or ``"reactions"`` (the canon-reaction backtest). Returns the refs.
    """
    reactions = eval_mode == "reactions"
    if reactions:
        probes = reaction_probes(character, episodes=DEFAULT_REACTION_EPISODES)
        dataset = [
            {"character": character, "scene": p.context_text(), "gold": p.gold_line}
            for p in probes
        ]
        scorers = [reaction_scorer]
        scorer_name = reaction_scorer.__name__
        eval_name = f"reaction-backtest-{character}"
        desc = (
            f"Unseen-future (Season 2) canon-reaction fidelity for {character} "
            "across training generations. Operators learn from Season 1; this "
            "board measures how well that transfers to held-out S2 scenes — "
            "judged against the character's real lines in real scenes."
        )
    else:
        probes = get_probes((character,))
        dataset = [{"character": p.character, "cue": p.cue} for p in probes]
        scorers = [fidelity_scorer]
        scorer_name = fidelity_scorer.__name__
        eval_name = f"fidelity-backtest-{character}"
        desc = (
            f"Held-out character-fidelity for {character} across training "
            "generations. Higher mean fidelity = more in-character."
        )

    evaluation = weave.Evaluation(name=eval_name, dataset=dataset, scorers=scorers)
    eval_ref = weave.publish(evaluation)

    asyncio.run(_evaluate_all(evaluation, genomes, reactions=reactions))

    board = leaderboard.Leaderboard(
        name=name or f"Character Fidelity — {character}",
        description=desc,
        columns=[
            leaderboard.LeaderboardColumn(
                evaluation_object_ref=eval_ref.uri(),
                scorer_name=scorer_name,
                summary_metric_path=_METRIC_PATH,
                should_minimize=False,
            )
        ],
    )
    board_ref = weave.publish(board)

    return LeaderboardResult(
        character=character,
        evaluation_ref=eval_ref.uri(),
        leaderboard_ref=board_ref.uri(),
        generations=len(genomes),
    )
