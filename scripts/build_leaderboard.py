"""Build logs/leaderboard.{json,html} from a finished train_all log + saved genomes.

Use this when a batch run finished before the HTML export existed (or to rebuild
the page without re-spending LLM calls):

    uv run python scripts/build_leaderboard.py logs/train-all-top6.log
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from got_agents.training import load_genome  # noqa: E402
from train_all import _render_html  # noqa: E402

_ROW = re.compile(
    r"^\s+(\d+)\s+([a-z][a-z .'-]+?)\s+([0-9.]+)\s+([0-9.]+)\s+([+-][0-9.]+)\s*$",
    re.M,
)


def _rules_for(key: str) -> list[str]:
    paths = sorted(
        glob.glob(f"logs/genomes/{key}/gen-*.json"),
        key=lambda p: int(os.path.basename(p).split("-")[1].split(".")[0]),
    )
    if not paths:
        return []
    try:
        return list(load_genome(paths[-1]).reflection_rules)
    except Exception:
        return []


def main(argv: list[str]) -> None:
    log_path = Path(argv[1] if len(argv) > 1 else "logs/train-all-top6.log")
    text = log_path.read_text()
    chars = []
    for rank, name, base, final, delta in _ROW.findall(text):
        name = name.strip()
        if name == "mean":
            continue
        key = name.replace(" ", "_")
        chars.append({
            "rank": int(rank),
            "name": name.title(),
            "key": key,
            "csv_name": name,
            "base_test": float(base),
            "final_test": float(final),
            "test_delta": float(delta),
            "train_delta": 0.0,
            "rules": _rules_for(key),
        })
    payload = {
        "metric": "unseen Season 2 canon-reaction fidelity",
        "split": {"train": "S1 e1-7", "val": "S1 e8-10", "test": "S2 e1-10"},
        "generations": 1,
        "characters": chars,
    }
    Path("logs/leaderboard.json").write_text(json.dumps(payload, indent=2))
    out = Path("logs/leaderboard.html")
    out.write_text(_render_html(payload))
    print(f"built {len(chars)} rows -> {out.resolve()}")


if __name__ == "__main__":
    main(sys.argv)
