"""inspect — a window into the agents (see the black box).

A read-only CLI to surface what's going on inside the sim. Subcommands:

    uv run python scripts/peek.py characters
        list every known + authored character with its authoring tier.

    uv run python scripts/peek.py lord cersei [--at s1e5]
        full dump of one Lord: identity, drives (felt + raw vector), and every
        memory it holds (canon-dated), optionally as of a story point.

    uv run python scripts/peek.py recall cersei "the wedding" [--at s1e5]
        show what the A.4 hybrid retrieval returns for a cue, with scores — the
        exact memories the agent would draw on.

    uv run python scripts/peek.py world s1e1
        fold the canon ledger at a story point: who's alive/dead, titles, oaths,
        and the secrets registry (who-knows-what).

    uv run python scripts/peek.py episode s1e1
        run the S1E1 seed skeleton end-to-end: each scene's turns, the world
        changes each decision resolves, and the world before vs after.

    uv run python scripts/peek.py council cersei ned tyrion \\
        --stakes "King Robert is dying; who rules?" [--setting "..."] \\
        [--rounds 2] [--at s1e1] [--score]
        run an N-way council (2+ characters) and print every turn with the full
        public / private / thinking layer, then each lord's appraisal.

Needs Redis up (./scripts/stack.sh up) and OPENAI_API_KEY for anything that hits
the model (lord/recall/council); `world` and `characters` are mostly offline.
"""

from __future__ import annotations

import argparse
import sys
import time

from got_agents.agent import Lord
from got_agents.characters import known
from got_agents.cognition import canon_time
from got_agents.infra import init_weave

_RULE = "=" * 78
_DASH = "-" * 78


# --- helpers --------------------------------------------------------------


def _fmt_ts(ts: float) -> str:
    """Render a memory timestamp as a canon point if it maps to one, else date."""
    base = canon_time.to_timestamp("s1e1")
    if ts < base - 1:
        return "backstory"
    # Find the nearest canon code at or below this timestamp.
    code = canon_time._MIN_CODE + round((ts - canon_time._BASE_EPOCH) / canon_time._SPACING)
    season, episode = code // 100, code % 100
    if abs(canon_time.to_timestamp((season, episode)) - ts) < 1.0 and 1 <= episode:
        return f"s{season}e{episode}"
    return time.strftime("%Y-%m-%d", time.localtime(ts))


def _print_drives(lord: Lord) -> None:
    print(f"  felt:  {lord.drives.felt(3)}")
    pairs = sorted(lord.drives.values.items(), key=lambda kv: kv[1], reverse=True)
    print("  drives:", "  ".join(f"{n}={v:.0f}" for n, v in pairs))


def _print_memory(m, *, show_score: bool = False) -> None:
    head = f"  [{_fmt_ts(m.timestamp)}] imp={m.importance:.2f}"
    if show_score and m.score is not None:
        head += f" score={m.score:.3f}"
    tags = ",".join(m.concepts)
    print(head + (f" ({tags})" if tags else ""))
    print(f"      {m.text}")


# --- subcommands ----------------------------------------------------------


def cmd_characters(_: argparse.Namespace) -> None:
    from got_agents.data_pipeline import cores, sources

    print(_RULE)
    print("CHARACTERS")
    print(_RULE)
    print("hand-authored:")
    for key in known():
        print(f"  - {key}")
    authored = sorted(p.stem for p in cores.cores_dir().glob("*.json")) \
        if cores.cores_dir().exists() else []
    if authored:
        print("\npipeline-authored cores (data/cores/):")
        for key in authored:
            try:
                tier = sources.tier_of(key.replace("_", " "))
            except Exception:
                tier = "?"
            print(f"  - {key}  [{tier}]")


def cmd_lord(args: argparse.Namespace) -> None:
    lord = Lord.load(args.key, at_time=args.at)
    g = lord.genome
    print(_RULE)
    horizon = f"  (as of {canon_time.label(args.at)})" if args.at else ""
    print(f"{g.name} — {g.title}{horizon}")
    print(_RULE)
    print(f"persona: {g.self_persona}")
    print(f"motive:  {g.life_motive}")
    if g.voice_anchors:
        print("voice:")
        for line in g.voice_anchors:
            print(f'  - "{line}"')
    print(f"fixed bag: {', '.join(g.fixed_bag)}")
    print()
    _print_drives(lord)
    print()
    memories = lord.memory.all()
    if args.at:
        cutoff = lord.as_of or 0.0
        shown = [m for m in memories if m.timestamp <= cutoff]
        print(f"memories ({len(shown)} of {len(memories)} within horizon):")
    else:
        shown = memories
        print(f"memories ({len(shown)}):")
    for m in shown:
        _print_memory(m)


def cmd_recall(args: argparse.Namespace) -> None:
    lord = Lord.load(args.key, at_time=args.at)
    print(_RULE)
    horizon = f"  (as of {canon_time.label(args.at)})" if args.at else ""
    print(f"{lord.genome.name} recalls for cue: {args.cue!r}{horizon}")
    print(_RULE)
    hits = lord.recall(args.cue, k=args.k)
    if not hits:
        print("  (nothing retrieved)")
        return
    for m in hits:
        _print_memory(m, show_score=True)


def _print_world(world) -> None:
    if world is None:
        print("  (no world)")
        return
    if world.dead:
        print("  dead:", ", ".join(sorted(world.dead)))
    if world.titles:
        print("  titles:")
        for who, title in sorted(world.titles.items()):
            print(f"    - {who}: {title}")
    if world.oaths:
        print("  oaths:")
        for o in world.oaths:
            print(f"    - {o.by} -> {o.to}: {o.terms}")
    if world.marriages:
        print("  marriages:")
        for m in world.marriages:
            print(f"    - {' + '.join(sorted(m))}")
    if world.alliances:
        print("  alliances:")
        for a in world.alliances:
            print(f"    - {' + '.join(sorted(a))}")
    if world.secrets:
        print("  secrets:")
        for sid, s in sorted(world.secrets.items()):
            print(f"    - [{sid}] {s.fact}")
            print(f"        known to: {', '.join(sorted(s.known_to)) or '(nobody)'}")


def cmd_world(args: argparse.Namespace) -> None:
    from got_agents.world import fold, load_ledger

    ledger = load_ledger()
    if not ledger:
        print("no ledger files under data/ledger/ — author some first.")
        return
    world = fold(ledger, args.point)
    print(_RULE)
    print(f"WORLD as of {canon_time.label(args.point)}")
    print(_RULE)
    _print_world(world)


def cmd_seed_memories(args: argparse.Namespace) -> None:
    from got_agents.data_pipeline import canon_memory

    report = canon_memory.seed_episode_memories(args.point)
    print(_RULE)
    print(f"SEEDED CANON MEMORIES from {canon_time.label(args.point)}")
    print(_RULE)
    if not report.seeded:
        print("  (no loadable characters were entitled to these events)")
        return
    for key, count in sorted(report.seeded.items()):
        print(f"  {key}: {count} memories")
    print(f"  total: {report.total}")


def cmd_episode(args: argparse.Namespace) -> None:
    from got_agents.orchestration import load_skeleton, run_episode

    skeleton = load_skeleton(args.point)
    print(_RULE)
    print(f"EPISODE {skeleton.episode}: {skeleton.title}")
    print(f"  {len(skeleton.beats)} scheduled beats")
    print(_RULE)

    result = run_episode(skeleton, appraise=not args.no_appraise)

    for i, scene in enumerate(result.scenes, 1):
        b = scene.beat
        print(f"\n— SCENE {i}: {b.setting}")
        print(f"  stakes: {b.stakes}")
        print(f"  cast:   {', '.join(b.cast)}")
        print(_DASH)
        for turn in scene.transcript.turns:
            d = turn.decision
            spoken = d.dialogue.strip() or "…(stays silent)"
            tgt = f" -> {d.target}" if d.target else ""
            print(f"  [r{turn.round}] {turn.speaker} ({d.action}{tgt}):")
            print(f"      says:    {spoken}")
            print(f"      PRIVATE: {d.private_intent}")
        if scene.effects:
            print("  world changes this scene:")
            for eff in scene.effects:
                print(f"      + {eff}")
        else:
            print("  (no durable world changes this scene)")

    print()
    print(_RULE)
    print("WORLD — before vs after the episode")
    print(_RULE)
    print("BEFORE:")
    _print_world(result.world_start)
    print("\nAFTER:")
    _print_world(result.world_end)



def cmd_council(args: argparse.Namespace) -> None:
    from got_agents.flows import run_council

    if len(args.cast) < 2:
        print("council needs at least 2 characters.")
        return
    cast = [Lord.load(k, at_time=args.at) for k in args.cast]
    horizon = f"  (as of {canon_time.label(args.at)})" if args.at else ""
    print(_RULE)
    print(f"COUNCIL: {', '.join(lord.genome.name for lord in cast)}{horizon}")
    print(f"setting: {args.setting}")
    print(f"stakes:  {args.stakes}")
    print(_RULE)

    transcript = run_council(
        cast,
        setting=args.setting,
        stakes=args.stakes,
        max_rounds=args.rounds,
        appraise=not args.no_appraise,
    )
    for turn in transcript.turns:
        d = turn.decision
        spoken = d.dialogue.strip() or "…(stays silent)"
        print(f"[r{turn.round}] {turn.speaker} ({d.action}"
              + (f" -> {d.target}" if d.target else "") + "):")
        print(f"    says:    {spoken}")
        print(f"    public:  {d.public_stance}")
        print(f"    PRIVATE: {d.private_intent}")
        if d.thinking:
            print(f"    thinks:  {d.thinking}")
        print()

    if args.score:
        from got_agents.outputs import score_deception_scene

        deception = score_deception_scene(transcript)
        print(_DASH)
        print(f"deception mean: {deception.mean:.2f}")
        for name, s in deception.by_speaker().items():
            print(f"  {name}: {s:.2f}")
        print()

    if transcript.appraisals:
        print(_DASH)
        print("after the scene:")
        for name, ap in transcript.appraisals.items():
            emotion = getattr(ap, "emotion", "")
            deltas = getattr(ap, "drive_deltas", {})
            print(f"  {name}: felt {emotion!r}; drive deltas {deltas}")
            mem = getattr(ap, "memory", "")
            if mem:
                print(f"      remembers: {mem}")


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="peek", description="see the agents")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("characters", help="list characters and tiers")

    p_lord = sub.add_parser("lord", help="dump one Lord's full state")
    p_lord.add_argument("key")
    p_lord.add_argument("--at", default=None, help="story point, e.g. s1e5")

    p_recall = sub.add_parser("recall", help="show retrieval for a cue")
    p_recall.add_argument("key")
    p_recall.add_argument("cue")
    p_recall.add_argument("--at", default=None)
    p_recall.add_argument("-k", type=int, default=5)

    p_world = sub.add_parser("world", help="fold the ledger at a story point")
    p_world.add_argument("point", help="story point, e.g. s1e1")

    p_seed = sub.add_parser(
        "seed-memories", help="fan an episode's canon ledger into character memory"
    )
    p_seed.add_argument("point", help="story point with a ledger, e.g. s1e1")

    p_episode = sub.add_parser("episode", help="run a seed skeleton end-to-end")
    p_episode.add_argument("point", help="story point with a skeleton, e.g. s1e1")
    p_episode.add_argument("--no-appraise", action="store_true")

    p_council = sub.add_parser("council", help="run an N-way council")
    p_council.add_argument("cast", nargs="+", help="2+ character keys")
    p_council.add_argument("--stakes", required=True)
    p_council.add_argument("--setting", default="a private council")
    p_council.add_argument("--rounds", type=int, default=2)
    p_council.add_argument("--at", default=None)
    p_council.add_argument("--score", action="store_true", help="LLM deception score")
    p_council.add_argument("--no-appraise", action="store_true")

    args = parser.parse_args(argv[1:])

    # Trace anything that touches the model.
    if args.cmd in {"lord", "recall", "council", "episode", "seed-memories"}:
        init_weave()

    {
        "characters": cmd_characters,
        "lord": cmd_lord,
        "recall": cmd_recall,
        "world": cmd_world,
        "seed-memories": cmd_seed_memories,
        "episode": cmd_episode,
        "council": cmd_council,
    }[args.cmd](args)


if __name__ == "__main__":
    main(sys.argv)
