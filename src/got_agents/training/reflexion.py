"""Reflexion operator (PART C.1, C.7) — verbal self-improvement from weak probes.

After a genome is evaluated, the character reads back its **lowest-scoring**
probe responses (with the judge's rationale) and writes itself a few concrete
behavioral rules for next time. Those rules append to the genome's
``reflection_rules`` (which flow into the persona prompt), so the next generation
holds itself to them. This is the cheapest improvement step and usually shows a
measurable gain within a generation or two.

Crucially the rules are written from the **judge's feedback on held-out probes**,
not from the canon references directly — the agent never sees the answer key,
only how it fell short.
"""

from __future__ import annotations

import weave

from got_agents.agent.genome import Genome
from got_agents.infra import llm
from got_agents.training.fidelity_eval import GenomeFidelity

_MAX_WEAK = 3  # how many of the weakest probes to reflect on
_MAX_RULES = 3  # rules to add per reflection pass

_SYSTEM = (
    "You are a performance coach for an actor playing a Game of Thrones "
    "character. The actor was scored on how faithfully they stayed in character. "
    "You are shown their WEAKEST moments — the situation, what they said, the "
    "judge's score, and why it fell short. Write short, concrete behavioral RULES "
    "the actor should follow next time to sound more like the real character. "
    "Rules must be general guidance (e.g. 'answer threats with colder menace, "
    "never explanation'), not lines to memorize.\n"
    f'Respond with JSON: {{"rules": [up to {_MAX_RULES} short imperative rules]}}.'
)


@weave.op
def reflect_rules(genome: Genome, fidelity: GenomeFidelity) -> tuple[str, ...]:
    """Return new behavioral rules mined from the genome's weakest probes."""
    weak = sorted(fidelity.results, key=lambda r: r.score)[:_MAX_WEAK]
    if not weak:
        return ()

    blocks = []
    for r in weak:
        blocks.append(
            f"Situation: {r.cue}\n"
            f"  They said: \"{r.line}\"\n"
            f"  Score: {r.score:.2f} — {r.rationale}"
        )
    messages = [
        {"role": "system", "content": _SYSTEM},
        {
            "role": "user",
            "content": (
                f"Character: {genome.name}\n\nWeakest moments:\n"
                + "\n\n".join(blocks)
            ),
        },
    ]
    raw = llm.complete_json(messages)
    rules = raw.get("rules") if isinstance(raw, dict) else None
    if not isinstance(rules, list):
        return ()
    cleaned = tuple(str(r).strip() for r in rules if str(r).strip())
    return cleaned[:_MAX_RULES]


def apply_reflection(genome: Genome, fidelity: GenomeFidelity) -> Genome:
    """Produce the next-generation genome with reflected rules appended."""
    new_rules = reflect_rules(genome, fidelity)
    if not new_rules:
        return genome.evolved(generation=genome.generation + 1)
    merged = _dedup(genome.reflection_rules + new_rules)
    return genome.evolved(
        reflection_rules=merged,
        generation=genome.generation + 1,
    )


def _dedup(rules: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    out: list[str] = []
    for rule in rules:
        key = rule.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(rule.strip())
    return tuple(out)
