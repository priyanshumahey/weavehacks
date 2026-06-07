"""Fidelity evaluation harness — Weave as the oracle (PART C.3).

``evaluate_genome`` runs a genome's :class:`CharacterModel` over the held-out
probe set and scores each produced line against fixed canon with
``score_line_fidelity``. It returns a clean summary (mean fidelity + per-probe
detail) AND logs a ``weave.Evaluation`` so the run appears in the Weave UI and
can bind to a Leaderboard — turning "the agent got better" into a tracked,
on-screen number across generations.
"""

from __future__ import annotations

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import weave

from got_agents.agent.genome import Genome
from got_agents.training.character_model import CharacterModel
from got_agents.training.dataset import probes as get_probes
from got_agents.training.fidelity_ref import score_line_fidelity
# Held-out episodes for the canon-reaction backtest. By default the TEST split is
# Season 2 — the agent learns from S1 and is measured on unseen S2 scenes.
from got_agents.training.splits import TEST_EPISODES as DEFAULT_REACTION_EPISODES

# Reaction probes are independent blocking-I/O LLM calls, so we fan them out.
# Override with GOT_REACTION_WORKERS to throttle for rate limits.
_REACTION_WORKERS = int(os.environ.get("GOT_REACTION_WORKERS", "8"))


@dataclass(frozen=True, slots=True)
class ProbeResult:
    cue: str
    line: str
    score: float
    violation: bool
    rationale: str


@dataclass(frozen=True, slots=True)
class GenomeFidelity:
    character: str
    generation: int
    mean: float
    violation_rate: float
    results: tuple[ProbeResult, ...] = field(default_factory=tuple)


def _fidelity_scorer(character: str, output: str) -> dict:
    """Weave scorer: judge the produced line against fixed canon."""
    result = score_line_fidelity(character, output)
    return {"fidelity": result.score, "violation": int(result.violation)}


async def _log_weave_eval(model: CharacterModel, dataset: list[dict]) -> None:
    evaluation = weave.Evaluation(
        dataset=dataset,
        scorers=[_fidelity_scorer],
    )
    await evaluation.evaluate(model)


@weave.op
def evaluate_genome(
    genome: Genome,
    *,
    character: str | None = None,
    log_to_weave: bool = True,
) -> GenomeFidelity:
    """Score a genome on the held-out backtest; return mean fidelity + detail."""
    char = character or genome.key
    probes = get_probes((char,))
    model = CharacterModel.from_genome(genome)

    results: list[ProbeResult] = []
    for probe in probes:
        line = model.predict(probe.cue)
        judged = score_line_fidelity(char, line)
        results.append(
            ProbeResult(
                cue=probe.cue,
                line=line,
                score=judged.score,
                violation=judged.violation,
                rationale=judged.rationale,
            )
        )

    n = len(results)
    mean = sum(r.score for r in results) / n if n else 0.0
    violation_rate = sum(1 for r in results if r.violation) / n if n else 0.0

    if log_to_weave and probes:
        # Re-run through weave.Evaluation so the run lands in the Weave UI /
        # leaderboard. Best-effort: never let eval logging break the loop.
        try:
            dataset = [{"character": p.character, "cue": p.cue} for p in probes]
            asyncio.run(_log_weave_eval(model, dataset))
        except Exception:  # pragma: no cover - logging must not block training
            pass

    return GenomeFidelity(
        character=char,
        generation=genome.generation,
        mean=mean,
        violation_rate=violation_rate,
        results=tuple(results),
    )



@weave.op
def evaluate_reactions(
    genome: Genome,
    *,
    character: str | None = None,
    episodes: tuple[str, ...] = DEFAULT_REACTION_EPISODES,
    max_probes: int = 8,
    speaker_csv_name: str | None = None,
) -> GenomeFidelity:
    """Score a genome on real canon scenes: react like the character actually did.

    Each probe is a real moment — the show's dialogue up to a point — and the
    agent's reply is judged against the character's *actual* next line. Defaults
    to the TEST split (Season 2). ``speaker_csv_name`` builds probes for a
    speaker that has no authored core (uses the script name directly).
    """
    from got_agents.training.canon_scenes import reaction_probes, scene_probes
    from got_agents.training.reaction_fidelity import score_reaction

    char = character or genome.key
    if speaker_csv_name:
        probes = scene_probes(
            speaker_csv_name,
            episodes=episodes,
            character_key=char,
            max_probes=max_probes,
        )
    else:
        probes = reaction_probes(char, episodes=episodes, max_probes=max_probes)
    model = CharacterModel.from_genome(genome)

    def _run_probe(probe: object) -> ProbeResult:
        # react() then score_reaction() are ordered WITHIN a probe, but probes
        # are independent of each other, so we fan them out across threads.
        response = model.react(probe.context_text())
        judged = score_reaction(probe, response)
        return ProbeResult(
            cue=f"[{probe.point}] {probe.context_text().splitlines()[-1][:70]}",
            line=response,
            score=judged.score,
            violation=not judged.matches_intent,
            rationale=f"canon: “{probe.gold_line[:80]}” — {judged.rationale}",
        )

    # Reaction scoring is pure I/O (blocking LLM calls), so a thread pool gives
    # near-linear speedup. order='preserved' keeps results stable for logging.
    if probes:
        workers = min(len(probes), _REACTION_WORKERS)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            results: list[ProbeResult] = list(pool.map(_run_probe, probes))
    else:
        results = []

    n = len(results)
    mean = sum(r.score for r in results) / n if n else 0.0
    violation_rate = sum(1 for r in results if r.violation) / n if n else 0.0
    return GenomeFidelity(
        character=char,
        generation=genome.generation,
        mean=mean,
        violation_rate=violation_rate,
        results=tuple(results),
    )
