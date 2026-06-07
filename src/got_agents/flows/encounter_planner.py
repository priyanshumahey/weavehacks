"""Encounter planner (L3) — the *mingle director*: who crosses paths after the
scenes, and why.

Once the staged conversations are done, the cast disperses and roams. This
planner decides the **incidental meetings** during that mingle: pairs who cross
paths in the hall, exchange a few charged words, and part. It deliberately
favours pairings the main scenes did NOT put together, so the mingle creates new
combinations (the lion who just left one room brushing past the wolf who left
another).

Pure planning: turns a premise + the present cast into a validated list of
:class:`EncounterPlan`s (no Lords, no Redis). The caller runs each as a short
two-person council.
"""

from __future__ import annotations

import weave

from dataclasses import dataclass

from got_agents.infra import llm

_MOODS = ("friendly", "tense", "hostile")
_DEFAULT_MOOD = "tense"

DEFAULT_MAX_ENCOUNTERS = 3
HARD_MAX_ENCOUNTERS = 5


@dataclass(frozen=True, slots=True)
class EncounterPlan:
    """One incidental meeting: exactly two characters crossing paths."""

    cast: tuple[str, str]
    setting: str
    stakes: str
    mood: str


_SYSTEM = """\
You are the MINGLE DIRECTOR for a generative Game of Thrones simulation.

The formal conversations are over; the court now disperses and drifts through
the halls. Your job: choose a handful of INCIDENTAL MEETINGS — two characters
who cross paths, trade a few loaded words, and move on. These are brief, not
councils: a glance, a barb, a whispered offer in passing.

You are given (1) the PREMISE that set the day in motion and (2) the ROSTER of
characters who are present. Return STRICT JSON:
{
  "encounters": [
    {
      "cast": ["<key>", "<key>"],
      "setting": "<where they cross paths, one short phrase>",
      "stakes": "<what passes between them in this brief meeting, one sentence>",
      "mood": "friendly" | "tense" | "hostile"
    }
  ]
}

RULES:
- Use ONLY character keys from the roster, spelled exactly. Each meeting is
  EXACTLY two distinct characters.
- Prefer pairings that are dramatically charged given who these people are and
  the premise — rivals, secret allies, a creditor and a debtor.
- Do not repeat the same pair. Spread the meetings across different characters.
- Keep settings and stakes short and in-world; this is a passing moment, not a
  scene.
"""


@weave.op
def plan_encounters(
    premise: str,
    roster: list[dict],
    *,
    max_encounters: int = DEFAULT_MAX_ENCOUNTERS,
    episode: str | None = None,
) -> list[EncounterPlan]:
    """Decompose the mingle into a few incidental two-person meetings.

    ``roster`` is a list of ``{"key", "name", "title"}`` for the present cast.
    The result is validated and clamped so each plan is a legal two-person
    council drawn from that roster.
    """
    premise = (premise or "").strip()
    if not premise or len(roster) < 2:
        return []

    max_encounters = max(0, min(int(max_encounters), HARD_MAX_ENCOUNTERS))
    if max_encounters == 0:
        return []

    by_key = {c["key"]: c for c in roster}
    catalog = "\n".join(
        f"  - {c['key']}: {c['name']}" + (f" — {c['title']}" if c.get("title") else "")
        for c in roster
    )
    user = (
        f"PREMISE:\n{premise}\n\n"
        + (f"Story moment: {episode}\n\n" if episode else "")
        + f"ROSTER (use these keys exactly):\n{catalog}\n\n"
        f"Choose up to {max_encounters} incidental meetings."
    )

    raw = llm.complete_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}]
    )
    return _parse(raw, by_key=by_key, max_encounters=max_encounters)


def _parse(
    raw: dict, *, by_key: dict[str, dict], max_encounters: int
) -> list[EncounterPlan]:
    entries = raw.get("encounters")
    if not isinstance(entries, list):
        return []

    plans: list[EncounterPlan] = []
    seen_pairs: set[frozenset[str]] = set()

    for entry in entries:
        if not isinstance(entry, dict):
            continue
        cast_raw = entry.get("cast")
        if not isinstance(cast_raw, list):
            continue
        keys: list[str] = []
        for key in cast_raw:
            if isinstance(key, str) and key in by_key and key not in keys:
                keys.append(key)
        if len(keys) != 2:
            continue
        pair = frozenset(keys)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)

        mood = entry.get("mood")
        if mood not in _MOODS:
            mood = _DEFAULT_MOOD
        setting = (entry.get("setting") or "").strip() or "a crossing in the hall"
        stakes = (
            (entry.get("stakes") or "").strip()
            or "each takes the other's measure in passing."
        )

        plans.append(
            EncounterPlan(
                cast=(keys[0], keys[1]),
                setting=setting,
                stakes=stakes,
                mood=mood,
            )
        )
        if len(plans) >= max_encounters:
            break

    return plans
