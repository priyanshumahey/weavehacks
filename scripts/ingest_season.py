"""Step 5 — scale the canon data across episodes, smoke-tested per episode.

    uv run python scripts/ingest_season.py s1e2 s1e3 s1e4   # explicit points
    uv run python scripts/ingest_season.py --season 1 --through 5   # s1e1..s1e5
    uv run python scripts/ingest_season.py s1e2 --no-extract  # smoke + seed only

For each episode in canon order: extract the ledger (reusing earlier secret
slugs), persist it, smoke-test the cumulative world, and seed canon memories to
that episode's present cast. Stops on the first smoke failure. Needs Redis up and
OPENAI_API_KEY for extraction/seeding.

Hand-authored ledgers (s1e1) are protected — pass --overwrite to replace.
"""

from __future__ import annotations

import argparse
import sys

from got_agents.data_pipeline.season import ingest_season
from got_agents.infra import init_weave


def _points(args: argparse.Namespace) -> list[str]:
    if args.points:
        return args.points
    if args.season:
        start = args.start or 1
        end = args.through or start
        return [f"s{args.season}e{e}" for e in range(start, end + 1)]
    return []


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="ingest_season")
    parser.add_argument("points", nargs="*", help="story points, e.g. s1e2 s1e3")
    parser.add_argument("--season", type=int, help="season number for a range")
    parser.add_argument("--start", type=int, help="first episode of the range")
    parser.add_argument("--through", type=int, help="last episode of the range")
    parser.add_argument("--no-extract", action="store_true", help="skip LLM extraction")
    parser.add_argument("--no-seed", action="store_true", help="skip memory seeding")
    parser.add_argument("--overwrite", action="store_true", help="replace existing ledgers")
    parser.add_argument("--continue", dest="keep_going", action="store_true",
                        help="do not stop on a smoke failure")
    args = parser.parse_args(argv[1:])

    points = _points(args)
    if not points:
        parser.error("give story points (e.g. s1e2 s1e3) or --season N --through M")

    init_weave()
    print(f"Ingesting {len(points)} episode(s): {', '.join(points)}\n")
    report = ingest_season(
        points,
        extract=not args.no_extract,
        overwrite=args.overwrite,
        seed_memories=not args.no_seed,
        stop_on_fail=not args.keep_going,
    )
    print(report.report())
    print()
    for ep in report.episodes:
        if ep.canon_memories:
            seeded = ", ".join(f"{k}:{n}" for k, n in sorted(ep.canon_memories.items()))
            print(f"  {ep.point} seeded -> {seeded}")
    if not report.ok:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv)
