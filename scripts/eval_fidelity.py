"""Evaluate a genome's character fidelity on the held-out canon backtest.

    uv run python scripts/eval_fidelity.py cersei       # gen-0 authored core
    uv run python scripts/eval_fidelity.py cersei --genome logs/genomes/cersei/gen-1.json

Runs the genome's CharacterModel over the held-out probes, scores each line
against fixed canon, and prints the mean fidelity. Logs a weave.Evaluation so
the run appears in Weave. Needs OPENAI_API_KEY; no Redis required.
"""

from __future__ import annotations

import argparse
import sys

from got_agents.characters import get_character
from got_agents.infra import init_weave
from got_agents.training import evaluate_genome, evaluate_reactions, load_genome


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="eval_fidelity")
    parser.add_argument("character", help="character key, e.g. cersei")
    parser.add_argument("--genome", help="path to a genome JSON (else the authored core)")
    parser.add_argument(
        "--reactions",
        action="store_true",
        help="use the canon-reaction backtest (real held-out scenes) instead of probes",
    )
    args = parser.parse_args(argv[1:])

    init_weave()

    if args.genome:
        genome = load_genome(args.genome)
    else:
        genome = get_character(args.character).genome

    mode = "canon-reaction backtest" if args.reactions else "held-out probes"
    print(f"Evaluating {genome.name} (gen-{genome.generation}) on the {mode}…\n")
    result = (
        evaluate_reactions(genome, character=args.character)
        if args.reactions
        else evaluate_genome(genome, character=args.character)
    )

    for r in result.results:
        flag = "  [VIOLATION]" if r.violation else ""
        print(f"  [{r.score:.2f}{flag}] {r.cue}")
        print(f"        “{r.line}”")
        if r.rationale:
            print(f"        judge: {r.rationale}")
        print()

    print(f"=== {genome.name} gen-{genome.generation} ===")
    print(f"  mean fidelity:  {result.mean:.3f}")
    print(f"  violation rate: {result.violation_rate:.2f}")


if __name__ == "__main__":
    main(sys.argv)
