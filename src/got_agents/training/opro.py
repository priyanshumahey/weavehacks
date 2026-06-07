"""OPRO operator (PART C.4, C.7) — persona mutation by optimization.

The core "evolution" step: feed the LLM the character's score history and its
current persona, ask for higher-scoring persona variants, evaluate each on the
held-out backtest, and keep the best. Unlike Reflexion (which appends rules),
OPRO rewrites the ``self_persona`` itself — the genome's heart.

Selection is on the **held-out fidelity** (the same oracle), so a variant only
wins if it genuinely sounds more like the character.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import weave

from got_agents.agent.genome import Genome
from got_agents.infra import llm
from got_agents.training.fidelity_eval import GenomeFidelity, evaluate_genome

_N_VARIANTS = 2

# An evaluator scores a genome and returns its fidelity. Threading this through
# lets the loop optimize against EITHER the held-out probes or the stronger
# canon-reaction backtest, without OPRO knowing which.
Evaluator = Callable[[Genome], GenomeFidelity]

_SYSTEM = (
    "You optimize the PERSONA prompt for an actor playing a Game of Thrones "
    "character. You are given the current persona and how it scored on a "
    "character-fidelity test. Propose improved persona descriptions that would "
    "make the actor sound MORE like the true character — sharper voice, truer "
    "values, the right cadence and menace. Keep each persona 2-4 sentences, "
    "first-person-friendly, and never reference being an AI or a test.\n"
    f'Respond with JSON: {{"personas": [{_N_VARIANTS} distinct persona strings]}}.'
)


@dataclass(frozen=True, slots=True)
class OproResult:
    genome: Genome
    fidelity: GenomeFidelity
    improved: bool
    variants_tried: int


@weave.op
def propose_personas(genome: Genome, fidelity: GenomeFidelity) -> tuple[str, ...]:
    """Ask the optimizer for higher-scoring persona variants."""
    weak = sorted(fidelity.results, key=lambda r: r.score)[:3]
    weak_text = "\n".join(f"  - ({r.score:.2f}) {r.cue} -> {r.rationale}" for r in weak)
    messages = [
        {"role": "system", "content": _SYSTEM},
        {
            "role": "user",
            "content": (
                f"Character: {genome.name}\n"
                f"Current persona:\n{genome.self_persona}\n\n"
                f"Current mean fidelity: {fidelity.mean:.3f}\n"
                f"Weakest moments:\n{weak_text}"
            ),
        },
    ]
    raw = llm.complete_json(messages)
    personas = raw.get("personas") if isinstance(raw, dict) else None
    if not isinstance(personas, list):
        return ()
    return tuple(str(p).strip() for p in personas if str(p).strip())[:_N_VARIANTS]


def optimize_persona(
    genome: Genome,
    fidelity: GenomeFidelity,
    *,
    character: str | None = None,
    evaluator: Evaluator | None = None,
) -> OproResult:
    """Generate persona variants, eval each, and keep the best vs the current.

    ``fidelity`` is the current genome's already-measured score (the baseline to
    beat). ``evaluator`` scores a candidate; defaults to the held-out probe eval.
    Returns the winning genome (possibly unchanged) and its fidelity.
    """
    char = character or genome.key
    score = evaluator or (
        lambda g: evaluate_genome(g, character=char, log_to_weave=False)
    )
    best_genome = genome
    best_fidelity = fidelity
    tried = 0

    for persona in propose_personas(genome, fidelity):
        candidate = genome.evolved(self_persona=persona)
        result = score(candidate)
        tried += 1
        if result.mean > best_fidelity.mean:
            best_genome = candidate
            best_fidelity = result

    improved = best_genome is not genome
    return OproResult(
        genome=best_genome,
        fidelity=best_fidelity,
        improved=improved,
        variants_tried=tried,
    )
