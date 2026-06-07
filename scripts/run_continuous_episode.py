"""Run a CONTINUOUS, multi-thread episode end to end and write its script JSON.

    uv run python scripts/run_continuous_episode.py \
        "The king names Tyrion's exile to the Wall; the lions scheme, the wolves watch." \
        --cast cersei tyrion ned jon robb jaime \
        --episode s1e7 --locations throne-room wall --phases 4

The episode plays on one continuous timeline: conversation threads begin, run,
and finish independently across map locations while characters move between them
with motive. State carries forward (memory + drives persist, actions mutate a
shared world) and the script captures the agents' learning. The output is an
episode-script JSON written to ``logs/scripts/`` and the world's data dir, so it
can be inspected directly and played by the world.

Needs Redis up and OPENAI_API_KEY for a live run.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
# scene_service lives in backend/app; make it importable.
sys.path.insert(0, str(_ROOT / "backend"))

# The Phaser world imports episode-script JSON from here (Vite resolves it).
_WORLD_SCRIPT_DIR = _ROOT / "world" / "src" / "data" / "scripts"
_LOG_SCRIPT_DIR = _ROOT / "logs" / "scripts"


def _summarize(script: dict) -> None:
    threads = script.get("threads", [])
    print(f"\n=== {script.get('title')} ===")
    print(
        f"{len(threads)} threads · cast {len(script.get('cast', []))} · "
        f"premise: {script.get('premise', '')[:70]}"
    )
    by_phase: dict[int, list[dict]] = {}
    for t in threads:
        by_phase.setdefault(t.get("phase", 0), []).append(t)
    for phase in sorted(by_phase):
        print(f"\n  Phase {phase + 1}:")
        for t in by_phase[phase]:
            cast = ", ".join(c["name"] for c in t["cast"])
            deps = ", ".join(t.get("dependsOn", [])) or "—"
            print(
                f"    [{t['mood']}] {t['locationId']} · {t['id']} "
                f"(after: {deps})  {cast}  · {len(t['turns'])} turns"
            )
            for turn in t["turns"][:2]:
                tgt = f" → {turn['target']}" if turn.get("target") else ""
                print(
                    f"        {turn['speakerName']} ({turn['action']}{tgt}): "
                    f"{turn['dialogue'][:64]}"
                )

    learning = script.get("learning", {})
    traj = learning.get("driveTrajectory", {})
    if traj:
        print("\n  --- drive trajectory (first→last per character) ---")
        for key, points in traj.items():
            if not points:
                continue
            first, last = points[0]["drives"], points[-1]["drives"]
            moved = sorted(
                ((n, round(last[n] - first.get(n, 0), 1)) for n in last),
                key=lambda kv: abs(kv[1]),
                reverse=True,
            )
            top = ", ".join(f"{n}{'+' if d >= 0 else ''}{d}" for n, d in moved[:3] if d)
            print(f"    {key}: {top or 'steady'}")
    reflections = learning.get("reflections", {})
    if reflections:
        print("\n  --- end-of-episode reflections ---")
        for name, r in reflections.items():
            print(f"    {name}: {r.get('summary', '')[:90]}")


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("premise", help="the dramatic premise to direct")
    parser.add_argument(
        "--cast", nargs="*", default=None, help="character keys to cast (optional)"
    )
    parser.add_argument("--episode", default="s1e7", help="canon rewind point")
    parser.add_argument(
        "--locations",
        nargs="*",
        default=["throne-room", "wall"],
        help="map location ids the director may use (first = start)",
    )
    parser.add_argument("--phases", type=int, default=4)
    parser.add_argument("--threads", type=int, default=3, help="max threads/phase")
    parser.add_argument("--rounds", type=int, default=2, help="council rounds/thread")
    parser.add_argument("--no-reflect", action="store_true")
    parser.add_argument("--name", default=None, help="output file stem")
    args = parser.parse_args(argv)

    from app import scene_service  # noqa: E402  (after sys.path tweak)

    # Fail fast (before any paid LLM calls) if cast keys are not spawnable —
    # the canonical keys are e.g. "tyrion_lannister", not "tyrion".
    if args.cast:
        spawnable = {c["key"] for c in scene_service.roster()}
        unknown = [k for k in args.cast if k not in spawnable]
        if unknown:
            print(f"ERROR: unknown/unspawnable cast keys: {', '.join(unknown)}")
            print("Spawnable keys:")
            for k in sorted(spawnable):
                print(f"  {k}")
            sys.exit(2)

    try:
        from got_agents.infra import init_weave

        init_weave()
    except Exception:
        pass

    print(f"Directing continuous episode: {args.premise[:70]}…")
    script = scene_service.build_continuous_episode(
        args.premise,
        cast_pool=args.cast,
        episode=args.episode,
        locations=args.locations,
        phases=args.phases,
        max_threads=args.threads,
        max_rounds=args.rounds,
        reflect=not args.no_reflect,
    )

    # Every run is saved as its own iteration (iter1, iter2, …) so a sequence of
    # generations can be watched and compared. An explicit --name overrides.
    stem = args.name or _next_iteration_stem()
    _LOG_SCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    _WORLD_SCRIPT_DIR.mkdir(parents=True, exist_ok=True)
    # Record what produced this iteration alongside the script.
    script["meta"] = {
        "iteration": stem,
        "premise": args.premise,
        "cast": args.cast,
        "episode": args.episode,
        "locations": args.locations,
        "phases": args.phases,
        "maxThreads": args.threads,
        "rounds": args.rounds,
    }
    payload = json.dumps(script, indent=2, ensure_ascii=False)
    log_path = _LOG_SCRIPT_DIR / f"{stem}.json"
    world_path = _WORLD_SCRIPT_DIR / f"{stem}.json"
    log_path.write_text(payload)
    world_path.write_text(payload)

    _summarize(script)
    print(f"\niteration -> {stem}")
    print(f"script    -> {log_path}")
    print(f"             {world_path}")


def _next_iteration_stem() -> str:
    """The next ``iterN`` name not yet used in the world script dir."""
    n = 1
    while (_WORLD_SCRIPT_DIR / f"iter{n}.json").exists() or (
        _LOG_SCRIPT_DIR / f"iter{n}.json"
    ).exists():
        n += 1
    return f"iter{n}"


if __name__ == "__main__":
    main(sys.argv[1:])
