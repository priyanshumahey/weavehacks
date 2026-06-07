"""Train the whole cast — a cross-character fidelity leaderboard (PART C.7).

    uv run python scripts/train_all.py                 # top 8 leads, 1 generation
    uv run python scripts/train_all.py --top 12 --generations 2
    uv run python scripts/train_all.py --char-workers 4 --no-anonymize

Selects the most-speaking characters that have both Season-1 (to learn from) and
Season-2 (to be tested on) dialogue, builds a core-less generic genome for each,
and evolves them all in parallel. Every character learns from S1 and is scored on
UNSEEN S2, so the final board is an honest generalization ranking. Needs
OPENAI_API_KEY; no Redis required.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from got_agents.infra import init_weave
from got_agents.training import select_cast, train_many


def main(argv: list[str]) -> None:
    parser = argparse.ArgumentParser(prog="train_all")
    parser.add_argument("--top", type=int, default=8, help="how many characters")
    parser.add_argument("--generations", type=int, default=1)
    parser.add_argument(
        "--char-workers", type=int, default=3,
        help="characters trained concurrently (x reaction workers = total LLM load)",
    )
    parser.add_argument(
        "--no-anonymize", action="store_true",
        help="keep real display names (less headroom, higher gen-0)",
    )
    parser.add_argument(
        "--names", nargs="*", default=None,
        help="explicit CSV speaker names instead of auto-selecting the top cast",
    )
    args = parser.parse_args(argv[1:])

    init_weave()
    cast = args.names or select_cast(top=args.top)
    print(f"Training {len(cast)} characters on S1, scoring on unseen S2 "
          f"({args.char_workers} at a time)…")
    for name in cast:
        print(f"  - {name}")
    print()

    results = train_many(
        cast,
        generations=args.generations,
        anonymize=not args.no_anonymize,
        char_workers=args.char_workers,
    )

    print("\n=== cross-character fidelity leaderboard (unseen Season 2) ===")
    print(f"  {'rank':<5}{'character':<22}{'gen-0':>7}{'final':>8}{'Δtest':>8}")
    print("  " + "-" * 48)
    for i, r in enumerate(results, 1):
        print(f"  {i:<5}{r.csv_name:<22}{r.base_test:>7.3f}{r.final_test:>8.3f}"
              f"{r.test_delta:>+8.3f}")
    print("  " + "-" * 48)
    if results:
        mean_final = sum(r.final_test for r in results) / len(results)
        mean_delta = sum(r.test_delta for r in results) / len(results)
        print(f"  {'mean':<27}{'':>7}{mean_final:>8.3f}{mean_delta:>+8.3f}")

    # Persist a machine-readable board so the web view (and backend) can serve it
    # without re-running training.
    out = Path("logs/leaderboard.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "metric": "unseen Season 2 canon-reaction fidelity",
        "split": {"train": "S1 e1-7", "val": "S1 e8-10", "test": "S2 e1-10"},
        "generations": args.generations,
        "characters": [
            {
                "rank": i,
                "name": r.csv_name.title(),
                "key": r.key,
                "csv_name": r.csv_name,
                "base_test": round(r.base_test, 4),
                "final_test": round(r.final_test, 4),
                "test_delta": round(r.test_delta, 4),
                "train_delta": round(r.train_delta, 4),
                "rules": list(r.run.best_genome.reflection_rules) if r.run.best_genome else [],
            }
            for i, r in enumerate(results, 1)
        ],
    }
    out.write_text(json.dumps(payload, indent=2))

    html = Path("logs/leaderboard.html")
    html.write_text(_render_html(payload))
    print(f"\n  saved -> {out}")
    print(f"  OPEN THIS IN YOUR BROWSER -> {html.resolve()}")


def _render_html(payload: dict) -> str:
    """A self-contained leaderboard page — data baked in, double-click to open."""
    data = json.dumps(payload)
    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>A Game of Agents — Fidelity Leaderboard</title>
<style>
  :root { --gold:#d4af37; --bg:#0f0d0a; --panel:#1a1611; --line:#33291a; --teal:#3fb6a8; }
  * { box-sizing:border-box; }
  body { margin:0; background:radial-gradient(1200px 600px at 50% -10%,#241d12,var(--bg));
    color:#e9e2d0; font:15px/1.5 ui-serif,Georgia,'Times New Roman',serif; padding:40px 16px; }
  .wrap { max-width:860px; margin:0 auto; }
  h1 { font-size:30px; letter-spacing:.5px; margin:0 0 4px; color:var(--gold); text-align:center; }
  .sub { text-align:center; color:#a89b7d; margin:0 0 4px; }
  .split { text-align:center; color:#7c715a; font-size:13px; margin:0 0 28px; }
  table { width:100%; border-collapse:collapse; background:var(--panel);
    border:1px solid var(--line); border-radius:12px; overflow:hidden; }
  th,td { padding:12px 14px; text-align:left; border-bottom:1px solid var(--line); }
  th { font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:#a89b7d; font-weight:600; }
  tr:last-child td { border-bottom:none; }
  .rank { width:42px; color:var(--gold); font-weight:700; text-align:center; }
  .name { font-weight:600; }
  .num { font-variant-numeric:tabular-nums; text-align:right; width:84px; }
  .bar { height:8px; border-radius:6px; background:#2a2316; position:relative; min-width:120px; }
  .bar > i { position:absolute; inset:0 auto 0 0; border-radius:6px;
    background:linear-gradient(90deg,var(--teal),var(--gold)); }
  .delta-pos { color:var(--teal); } .delta-neg { color:#c0594e; }
  .rules { color:#9c8f72; font-size:13px; }
  details summary { cursor:pointer; color:var(--gold); }
  .foot { text-align:center; color:#6b6048; font-size:12px; margin-top:22px; }
  .medal { font-size:18px; }
</style></head><body><div class="wrap">
  <h1>A Game of Agents</h1>
  <p class="sub" id="metric"></p>
  <p class="split" id="split"></p>
  <table><thead><tr>
    <th class="rank">#</th><th>Character</th><th>gen-0</th>
    <th>Trained (unseen S2)</th><th class="num">&Delta;</th>
  </tr></thead><tbody id="rows"></tbody></table>
  <div class="foot">Each agent learns from Season 1 and is scored on Season 2 it has never seen.
    A higher bar = a more in-character voice on future scenes.</div>
</div>
<script>
const DATA = """ + data + """;
document.getElementById('metric').textContent = 'Cross-character fidelity \u2014 ' + DATA.metric;
document.getElementById('split').textContent =
  'TRAIN ' + DATA.split.train + '  \u00b7  VAL ' + DATA.split.val + '  \u00b7  TEST ' + DATA.split.test
  + '   (' + DATA.generations + ' generation' + (DATA.generations===1?'':'s') + ')';
const medals = {1:'\\uD83E\\uDD47',2:'\\uD83E\\uDD48',3:'\\uD83E\\uDD49'};
const rows = DATA.characters.map(c => {
  const pct = Math.round(c.final_test*100);
  const d = c.test_delta>=0 ? 'delta-pos' : 'delta-neg';
  const sign = c.test_delta>=0 ? '+' : '';
  const rules = (c.rules||[]).length
    ? '<details><summary>learned voice</summary><ul class="rules">' +
      c.rules.map(r=>'<li>'+r.replace(/</g,'&lt;')+'</li>').join('') + '</ul></details>' : '';
  return '<tr><td class="rank">'+(medals[c.rank]?'<span class="medal">'+medals[c.rank]+'</span>':c.rank)+'</td>'
    + '<td><div class="name">'+c.name+'</div>'+rules+'</td>'
    + '<td class="num">'+c.base_test.toFixed(3)+'</td>'
    + '<td><div class="bar"><i style="width:'+pct+'%"></i></div>'
    + '<small>'+c.final_test.toFixed(3)+'</small></td>'
    + '<td class="num '+d+'">'+sign+c.test_delta.toFixed(3)+'</td></tr>';
}).join('');
document.getElementById('rows').innerHTML = rows;
</script></body></html>"""


if __name__ == "__main__":
    main(sys.argv)
