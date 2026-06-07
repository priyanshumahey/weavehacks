"""Seed a batch of test scenes — run several directed episodes in parallel and
save each as a replayable JSON in the scene library.

Each premise targets one of the world's maps and (optionally) a cast pool, so the
library ends up with a spread of scenes to test movement, mingling, and the
different locations without regenerating every time. Scenes auto-save to
``logs/scenes/`` exactly like the UI's "Direct" action, so they show up in the
Library tab immediately.

    uv run python scripts/seed_episodes.py                 # all premises, 3 at a time
    uv run python scripts/seed_episodes.py --workers 2     # gentler on rate limits
    uv run python scripts/seed_episodes.py --only wall dragonstone

Needs Redis up and OPENAI_API_KEY (same as the live sim). Generation is slow
(~1–2 min per episode); parallelism is across premises.
"""

from __future__ import annotations

import argparse
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# build_episode + saved_scenes live under backend/app.
_REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO / "backend"))

from app import saved_scenes  # noqa: E402
from app.scene_service import build_episode, roster  # noqa: E402

# Each test premise. ``pool`` restricts casting (empty = the AI casts freely);
# ``location`` bakes the map so the saved scene plays there by default. Picked to
# exercise every map plus a range of cast sizes.
PREMISES: list[dict] = [
    {
        "name": "throne-succession",
        "premise": (
            "King Robert lies dying after the boar hunt. Across the Red Keep the "
            "Lannisters move to crown Joffrey, the Starks insist on Robert's lawful "
            "will, and the spider and the mockingbird trade secrets in the shadows."
        ),
        "location": "throne-room",
        "pool": [],
        "max_groups": 3,
        "max_rounds": 2,
        "encounters": 3,
    },
    {
        "name": "winterfell-arrival",
        "premise": (
            "The royal party rides north for Winterfell. The Stark household braces: "
            "Catelyn frets over what the king's favour will cost, the children quarrel "
            "and dream, and Theon watches the family that is not quite his own."
        ),
        "location": "winterfell",
        "pool": [
            "ned",
            "catelyn_stark",
            "robb_stark",
            "jon_snow",
            "arya_stark",
            "sansa_stark",
            "theon_greyjoy",
        ],
        "max_groups": 3,
        "max_rounds": 2,
        "encounters": 2,
    },
    {
        "name": "wall-tyrion-jon",
        "premise": (
            "Tyrion Lannister lingers at the Wall on his way south, mocking the Night's "
            "Watch even as he is drawn to it. Jon Snow takes the measure of the clever "
            "dwarf who names himself a friend to bastards and cripples."
        ),
        "location": "wall",
        "pool": ["jon_snow", "tyrion_lannister"],
        "max_groups": 1,
        "max_rounds": 2,
        "encounters": 0,
    },
    {
        "name": "vaes-dothrak-daenerys",
        "premise": (
            "Deep in the Dothraki sea at Vaes Dothrak, Daenerys Targaryen stops being "
            "her brother's frightened sister and starts becoming a khaleesi. Ser Jorah "
            "watches the girl harden into a queen, and weighs his own divided loyalties."
        ),
        "location": "vaes-dothrak",
        "pool": ["daenerys_targaryen", "jorah_mormont"],
        "max_groups": 1,
        "max_rounds": 2,
        "encounters": 0,
    },
    {
        "name": "dragonstone-brothers",
        "premise": (
            "On the windswept rock of Dragonstone, the Baratheon brothers each believe "
            "the Iron Throne is theirs by right — Stannis by law and grim duty, Renly by "
            "charm and the love of the realm. Neither will bend."
        ),
        "location": "dragonstone",
        "pool": ["stannis", "renly_baratheon"],
        "max_groups": 1,
        "max_rounds": 2,
        "encounters": 0,
    },
    {
        "name": "throne-lions",
        "premise": (
            "The lions gather in the capital. Tywin demands his children close ranks and "
            "remember what they owe the name Lannister, while Cersei, Jaime, and Tyrion "
            "each guard their own ambitions and wounds."
        ),
        "location": "throne-room",
        "pool": ["cersei", "jaime_lannister", "tyrion_lannister", "tywin_lannister"],
        "max_groups": 2,
        "max_rounds": 2,
        "encounters": 2,
    },
]


def _run_one(spec: dict, valid_keys: set[str]) -> dict:
    name = spec["name"]
    pool = [k for k in spec.get("pool", []) if k in valid_keys]
    dropped = [k for k in spec.get("pool", []) if k not in valid_keys]
    if spec.get("pool") and len(pool) < 2:
        return {
            "name": name,
            "ok": False,
            "error": f"cast pool too small after validation (dropped {dropped})",
        }

    start = time.time()
    try:
        ensemble = build_episode(
            spec["premise"],
            cast_pool=pool or None,
            location=spec.get("location", "throne-room"),
            max_groups=spec.get("max_groups", 3),
            max_rounds=spec.get("max_rounds", 2),
            encounters=spec.get("encounters", 2),
        )
    except Exception as exc:  # noqa: BLE001 — report any failure per premise
        return {"name": name, "ok": False, "error": f"{type(exc).__name__}: {exc}"}

    meta = saved_scenes.save(
        ensemble,
        premise=spec["premise"],
        location=spec.get("location", "throne-room"),
        kind="episode",
    )
    return {
        "name": name,
        "ok": True,
        "saved": meta["name"],
        "groups": len(ensemble.get("groups", [])),
        "encounters": len(ensemble.get("encounters", [])),
        "dropped": dropped,
        "secs": round(time.time() - start, 1),
    }


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="seed_episodes")
    parser.add_argument(
        "--workers", type=int, default=3, help="how many premises to run at once"
    )
    parser.add_argument(
        "--only", nargs="*", help="only these premise names (default: all)"
    )
    args = parser.parse_args(argv[1:])

    specs = PREMISES
    if args.only:
        wanted = set(args.only)
        specs = [s for s in PREMISES if s["name"] in wanted]
        if not specs:
            parser.error(f"no premises match {sorted(wanted)}; "
                         f"have {[s['name'] for s in PREMISES]}")

    valid_keys = {c["key"] for c in roster()}
    print(f"Seeding {len(specs)} scene(s), {args.workers} at a time…\n")

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(_run_one, s, valid_keys): s["name"] for s in specs}
        for future in as_completed(futures):
            res = future.result()
            results.append(res)
            if res["ok"]:
                drop = f" (dropped {res['dropped']})" if res["dropped"] else ""
                print(
                    f"  ✓ {res['name']:<22} {res['groups']} groups / "
                    f"{res['encounters']} mingle · {res['secs']}s -> {res['saved']}{drop}"
                )
            else:
                print(f"  ✗ {res['name']:<22} {res['error']}")

    ok = sum(1 for r in results if r["ok"])
    print(f"\nDone: {ok}/{len(results)} saved to logs/scenes/ (open the Library to replay).")


if __name__ == "__main__":
    main(sys.argv)
