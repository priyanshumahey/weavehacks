"""Run scored council scenarios and log them.

    uv run python scripts/council_demo.py            # all scenarios
    uv run python scripts/council_demo.py snakes      # one by key

Needs Redis up and OPENAI_API_KEY set. Each run is written to
logs/council/<stamp>-<scenario>.{txt,json}.
"""

from __future__ import annotations

import sys

from got_agents.agent import Lord
from got_agents.flows import run_council
from got_agents.infra import init_weave
from got_agents.outputs import score_deception_scene, write_run
from got_agents.outputs.chronicle import render_text, to_dict

SCENARIOS: dict[str, dict[str, object]] = {
    "succession": {
        "title": "Succession Crisis — a schemer meets an honest man",
        "expect": "MIXED — Cersei should scheme; Ned should stay plain.",
        "cast": ["ned", "cersei"],
        "setting": "the small council chamber of the Red Keep",
        "stakes": (
            "King Robert lies dying from a boar's tusk. Who rules, and who guards "
            "the succession, must be settled before the court learns the truth."
        ),
    },
    "honest": {
        "title": "Two Honest Men — a lawful claim, openly argued",
        "expect": "LOW deception — both speak the law; little reason to mask intent.",
        "cast": ["stannis", "ned"],
        "setting": "the war table on Dragonstone",
        "stakes": (
            "Robert is dead and Joffrey is crowned. Stannis, the rightful heir by "
            "law, asks Ned Stark to declare for him and bring the North to his "
            "banner against the false king."
        ),
    },
    "snakes": {
        "title": "A Den of Snakes — two schemers feel each other out",
        "expect": "HIGH deception — both should mask contradictory private aims.",
        "cast": ["littlefinger", "cersei"],
        "setting": "a shadowed alcove off the throne room",
        "stakes": (
            "With the king dead, Littlefinger offers the queen the loyalty of the "
            "City Watch — for a price. Each needs the other for now, and each "
            "means to discard the other the moment it is safe."
        ),
    },
}


def run_scenario(key: str) -> None:
    scn = SCENARIOS[key]
    cast = [Lord.load(name) for name in scn["cast"]]  # type: ignore[union-attr]
    transcript = run_council(
        cast, setting=scn["setting"], stakes=scn["stakes"], max_rounds=2
    )
    deception = score_deception_scene(transcript)

    record = to_dict(
        transcript,
        deception,
        scenario=key,
        title=str(scn["title"]),
        expect=str(scn["expect"]),
    )
    print(render_text(record))

    json_path, txt_path = write_run(
        transcript,
        deception,
        scenario=key,
        title=str(scn["title"]),
        expect=str(scn["expect"]),
    )
    print(f"logged -> {txt_path}")
    print(f"         {json_path}\n")


def main(argv: list[str]) -> None:
    init_weave()
    keys = [argv[1]] if len(argv) > 1 else list(SCENARIOS)
    for key in keys:
        if key not in SCENARIOS:
            print(f"unknown scenario {key!r}; known: {list(SCENARIOS)}")
            continue
        run_scenario(key)


if __name__ == "__main__":
    main(sys.argv)
