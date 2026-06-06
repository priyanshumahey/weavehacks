#!/usr/bin/env python
"""Scrape Wikipedia Plot synopses for every Game of Thrones episode.

Roster comes from data/Game_of_Thrones_Script.csv so it joins with the dialogue.
Output: data/got_episodes.json (git-ignored).

    uv run python scripts/scrape_episodes.py
"""

from __future__ import annotations

import csv
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT_CSV = REPO_ROOT / "data" / "Game_of_Thrones_Script.csv"
OUT_JSON = REPO_ROOT / "data" / "got_episodes.json"

API = "https://en.wikipedia.org/w/api.php"
WIKI_BASE = "https://en.wikipedia.org/wiki/"
USER_AGENT = "weavehacks-got-agents/0.1 (research harness)"
REQUEST_DELAY_S = 0.5

# Titles that collide with songs/places/the show; resolved by exact article.
TITLE_OVERRIDES: dict[tuple[int, int], str] = {
    (3, 7): "The Bear and the Maiden Fair",
    (6, 2): "Home (Game of Thrones)",
    (7, 3): "The Queen's Justice",
    (8, 3): "The Long Night (Game of Thrones)",
}

_PLOT_HEADER = re.compile(r"^==\s*Plot(?:\s+summary)?\s*==\s*$", re.MULTILINE)
_NEXT_L2_HEADER = re.compile(r"^==\s*[^=].*?==\s*$", re.MULTILINE)
_ANY_HEADER = re.compile(r"^=+\s*.*?\s*=+\s*$", re.MULTILINE)


def episode_roster() -> list[dict]:
    seen: dict[tuple[str, str], dict] = {}
    with SCRIPT_CSV.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            key = (row["Season"], row["Episode"])
            if key in seen:
                continue
            seen[key] = {
                "season": int(row["Season"].split()[-1]),
                "episode": int(row["Episode"].split()[-1]),
                "title": row["Episode Title"].strip(),
                "release_date": row["Release Date"].strip(),
            }
    return list(seen.values())


def api_get(params: dict) -> dict:
    query = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
        return json.load(resp)


def fetch_extract(params: dict) -> tuple[str | None, str]:
    base = {
        "action": "query",
        "prop": "extracts",
        "explaintext": "1",
        "exsectionformat": "wiki",
        "redirects": "1",
        "exlimit": "1",
    }
    pages = api_get({**base, **params}).get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return None, ""
    return pages[0].get("title"), pages[0].get("extract", "") or ""


def resolve_episode(season: int, episode: int, title: str) -> tuple[str | None, str]:
    if override := TITLE_OVERRIDES.get((season, episode)):
        return fetch_extract({"titles": override})
    return fetch_extract({
        "generator": "search",
        "gsrsearch": f'intitle:"{title}" Game of Thrones',
        "gsrlimit": "1",
    })


def extract_plot(text: str) -> str | None:
    header = _PLOT_HEADER.search(text)
    if not header:
        return None
    body = text[header.end():]
    nxt = _NEXT_L2_HEADER.search(body)
    section = _ANY_HEADER.sub("", body[: nxt.start()] if nxt else body)
    return re.sub(r"\n{3,}", "\n\n", section).strip() or None


def scrape() -> list[dict]:
    results: list[dict] = []
    failures: list[str] = []
    for ep in episode_roster():
        tag = f"S{ep['season']:02d}E{ep['episode']:02d}"
        try:
            wiki_title, text = resolve_episode(ep["season"], ep["episode"], ep["title"])
            plot = extract_plot(text) if text else None
        except Exception as exc:  # noqa: BLE001
            wiki_title, plot = None, None
            print(f"  {tag} {ep['title']!r}: {exc}", file=sys.stderr)
        results.append({
            **ep,
            "wiki_title": wiki_title,
            "wiki_url": (
                WIKI_BASE + urllib.parse.quote(wiki_title.replace(" ", "_"))
                if wiki_title else None
            ),
            "synopsis": plot,
        })
        if not plot:
            failures.append(f"{tag} {ep['title']!r} -> {wiki_title!r}")
        print(f"  {tag} {ep['title']:<38} -> {wiki_title!r} [{'ok' if plot else 'NO PLOT'}]")
        time.sleep(REQUEST_DELAY_S)

    print(f"\nScraped {len(results)} episodes; {len(failures)} without a Plot section.")
    for f in failures:
        print(f"  MISSING: {f}", file=sys.stderr)
    return results


def main() -> int:
    if not SCRIPT_CSV.exists():
        print(f"ERROR: {SCRIPT_CSV} not found. Run ./scripts/download-data.sh first.",
              file=sys.stderr)
        return 1
    results = scrape()
    OUT_JSON.write_text(json.dumps(results, indent=2, ensure_ascii=False), "utf-8")
    print(f"Wrote {OUT_JSON.relative_to(REPO_ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
