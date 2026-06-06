"""Canon event-ledger extraction (PART E.2) — synopsis + script -> ledger JSON.

One LLM pass per episode turns the synopsis (plus a sample of that episode's
script lines for grounding) into ordered ledger events in the exact schema
``world/ledger.py`` loads and ``fold`` consumes. Runs **episode-by-episode** so
the canon timeline is built incrementally S1E1 -> S7 and smoke-tested per step.

Legal: emit only short DERIVED FACTS — never large copyrighted text.
"""

from __future__ import annotations

import json
from pathlib import Path

import weave

from got_agents.cognition import canon_time
from got_agents.data_pipeline import sources
from got_agents.infra import llm
from got_agents.world.ledger import ledger_dir
from got_agents.world.types import EFFECT_OPS, LedgerEvent

_MAX_LINES = 40

_SYSTEM = (
    "You extract a canon EVENT LEDGER from a Game of Thrones episode for a "
    "political simulation. Read the synopsis (and sample lines) and list the "
    "durable events that change the world: deaths, title changes, marriages, "
    "betrothals, oaths, alliances, secrets and secret reveals, betrayals.\n"
    "Emit only SHORT DERIVED FACTS — never long quotes or copyrighted text.\n\n"
    "Each event has structured EFFECTS drawn from this CLOSED vocabulary; omit "
    "effects you cannot ground:\n"
    '  {"op": "kill", "who": "<character>"}\n'
    '  {"op": "title", "who": "<character>", "title": "<title>"}\n'
    '  {"op": "oath", "by": "<character>", "to": "<character>", "terms": "<short>"}\n'
    '  {"op": "ally", "who": ["<a>", "<b>"]}\n'
    '  {"op": "marry", "who": ["<a>", "<b>"]}\n'
    '  {"op": "secret", "secret": "<slug>", "fact": "<short>", "known_to": ["<a>"]}\n'
    '  {"op": "learn", "secret": "<existing-slug>", "who": "<character>"}\n\n'
    "Character names: lowercase, as they appear in the show (e.g. 'eddard stark', "
    "'cersei lannister'). Reuse a secret's SAME slug across episodes so later "
    "'learn' effects attach to the right secret.\n"
    "Respond with a JSON object: {\"events\": [ {\"id\": \"<point>-<slug>\", "
    "\"point\": \"<the given point>\", \"order\": <int, story order within the "
    "episode>, \"type\": \"<death|title|marriage|betrothal|oath|alliance|secret|"
    "reveal|betrayal|rumor|omen>\", \"summary\": \"<one short sentence>\", "
    "\"participants\": [\"<character>\"], \"visibility\": \"public|secret\", "
    "\"known_to\": [\"<character>\"], \"effects\": [ ... ] } ] }."
)


@weave.op
def extract_episode(
    point: str,
    *,
    include_lines: bool = True,
    known_secrets: dict[str, str] | None = None,
) -> list[LedgerEvent]:
    """Extract ledger events for one episode (e.g. ``"s1e2"``).

    ``known_secrets`` maps already-registered secret slugs to their facts; passed
    to the model so later-episode ``learn`` effects reuse the SAME slug instead
    of minting a new one (PART E.2 continuity).
    """
    syn = sources.synopsis(point)
    user = f"Episode point: {point}\n\nSynopsis:\n{syn}"
    if known_secrets:
        catalog = "\n".join(f"  - {sid}: {fact}" for sid, fact in known_secrets.items())
        user += (
            "\n\nSecrets ALREADY registered in earlier episodes — if one is "
            "learned or revealed now, emit a `learn` effect reusing its exact "
            f"slug (do NOT register a new secret for these):\n{catalog}"
        )
    if include_lines:
        lines = sources.lines_in_episode(point)[:_MAX_LINES]
        if lines:
            rendered = "\n".join(f"  - {ln.speaker}: {ln.text}" for ln in lines)
            user += f"\n\nSample lines (for grounding):\n{rendered}"
    raw = llm.complete_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}]
    )
    return _parse(point, raw)


def known_secrets_before(point: str, ledger: list[LedgerEvent]) -> dict[str, str]:
    """Catalog secret slug -> fact registered strictly before ``point``."""
    from got_agents.cognition import canon_time

    cutoff = canon_time.code(point)
    catalog: dict[str, str] = {}
    for event in ledger:
        if canon_time.code(event.point) >= cutoff:
            continue
        for eff in event.effects:
            if eff.get("op") == "secret" and eff.get("secret"):
                catalog[str(eff["secret"])] = str(eff.get("fact") or "")
    return catalog



def _parse(point: str, raw: dict) -> list[LedgerEvent]:
    events: list[LedgerEvent] = []
    for i, e in enumerate(raw.get("events") or ()):
        if not isinstance(e, dict):
            continue
        effects = tuple(
            dict(eff)
            for eff in (e.get("effects") or ())
            if isinstance(eff, dict) and eff.get("op") in EFFECT_OPS
        )
        events.append(
            LedgerEvent(
                id=str(e.get("id") or f"{point}-event-{i}"),
                point=str(e.get("point") or point),
                type=str(e.get("type") or "event"),
                summary=str(e.get("summary") or ""),
                participants=tuple(str(p).lower() for p in e.get("participants") or ()),
                effects=effects,
                visibility=str(e.get("visibility") or "public"),
                known_to=tuple(str(k).lower() for k in e.get("known_to") or ()),
                order=int(e.get("order") or i),
            )
        )
    events.sort(key=lambda ev: ev.sort_key)
    return events


def write_episode_ledger(
    point: str, events: list[LedgerEvent], *, overwrite: bool = False
) -> Path:
    """Persist an episode's extracted events to ``data/ledger/<point>.json``."""
    directory = ledger_dir()
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{point}.json"
    if path.exists() and not overwrite:
        raise FileExistsError(
            f"{path} exists; pass overwrite=True to replace (hand-authored "
            "ledgers are protected by default)"
        )
    title = ""
    try:
        title = canon_time.label(point)
    except ValueError:
        pass
    payload = {
        "episode": point,
        "title": title,
        "events": [e.to_dict() for e in events],
    }
    path.write_text(json.dumps(payload, indent=2))
    return path
