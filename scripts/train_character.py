"""Train a character — the gen-0 -> gen-N fidelity climb (PART C).

    uv run python scripts/train_character.py cersei                 # 1 generation
    uv run python scripts/train_character.py cersei --generations 2
    uv run python scripts/train_character.py cersei --no-opro       # reflexion only

Evaluates the authored genome (gen-0), then evolves it with Reflexion + OPRO,
keeping only improvements (elitist), and prints the score trajectory. Each
generation is logged to Weave and saved to logs/genomes/<key>/. Needs
OPENAI_API_KEY; no Redis required.
"""

from __future__ import annotations

import argparse
import sys

from got_agents.characters import get_character
from got_agents.infra import init_weave
from got_agents.training import blank_genome, publish_leaderboard, train_character


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="train_character")
    parser.add_argument("character", help="character key, e.g. cersei")
    parser.add_argument("--generations", type=int, default=1)
    parser.add_argument("--no-reflexion", action="store_true")
    parser.add_argument("--no-opro", action="store_true")
    parser.add_argument(
        "--from-blank",
        action="store_true",
        help="start from a stripped-down generic persona (ablation) to show a climb",
    )
    parser.add_argument(
        "--leaderboard",
        action="store_true",
        help="publish a Weave leaderboard ranking every generation",
    )
    parser.add_argument(
        "--reactions",
        action="store_true",
        help="optimize against the canon-reaction backtest (real held-out scenes)",
    )
    args = parser.parse_args(argv[1:])

    init_weave()
    genome = blank_genome(args.character) if args.from_blank else get_character(args.character).genome
    start = "blank slate" if args.from_blank else "authored core"
    eval_mode = "reactions" if args.reactions else "probes"
    print(f"Training {genome.name} from {start} for {args.generations} "
          f"generation(s) on the {eval_mode} eval…\n")

    run = train_character(
        genome,
        generations=args.generations,
        use_reflexion=not args.no_reflexion,
        use_opro=not args.no_opro,
        eval_mode=eval_mode,
    )

    print("=== fidelity trajectory  (TRAIN=S1 e1-7 · VAL=S1 e8-10 · TEST=S2 unseen) ===")
    for gen in run.history:
        train_bar = "█" * round(gen.mean * 30)
        print(f"  gen-{gen.generation}: train {gen.mean:.3f} {train_bar}")
        if eval_mode == "reactions":
            val_bar = "█" * round(gen.val_mean * 30)
            test_bar = "█" * round(gen.test_mean * 30)
            print(f"          val   {gen.val_mean:.3f} {val_bar}  <- selection")
            print(f"          test  {gen.test_mean:.3f} {test_bar}  <- generalization")
    print()
    print(f"  train delta (gen-0 -> final): {run.delta:+.3f}")
    if eval_mode == "reactions":
        print(f"  TEST  delta (unseen S2):      {run.test_delta:+.3f}  <- the honest headline")
    if run.best_genome is not None:
        print(f"  best genome: gen-{run.best_genome.generation} "
              f"(train {run.best_fidelity.mean:.3f})")
        if run.best_genome.reflection_rules:
            print("  learned rules:")
            for rule in run.best_genome.reflection_rules:
                print(f"    - {rule}")

    if args.leaderboard and run.genomes:
        print("\nPublishing Weave leaderboard…")
        result = publish_leaderboard(args.character, run.genomes, eval_mode=eval_mode)
        print(f"  ranked {result.generations} generations")
        print(f"  leaderboard: {result.leaderboard_ref}")


if __name__ == "__main__":
    main(sys.argv)
