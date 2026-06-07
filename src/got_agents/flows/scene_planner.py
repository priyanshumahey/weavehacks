"""Scene planner (L3) — the *director*: one premise → several concurrent scenes.

The "give one prompt and let the AI resolve the rest" path. A showrunner LLM call
takes a dramatic premise plus the roster of available characters and decomposes
it into several **simultaneous** conversations happening in different corners of
the world — who is talking to whom, where, and what each huddle is fighting over.
The orchestrator then runs one council per planned group and stitches them into a
multi-group ensemble.

Pure planning: this module only turns a premise into a validated list of
:class:`ScenePlan`s (no Lords, no Redis). The caller runs the councils.
"""

from __future__ import annotations

import weave

from dataclasses import dataclass

from got_agents.infra import llm

# Moods the world understands (mirror world/src/replay/ensembleTypes.ts).
_MOODS = ("friendly", "tense", "hostile")
_DEFAULT_MOOD = "tense"

MIN_GROUP = 2
MAX_GROUP = 4
DEFAULT_MAX_GROUPS = 3
HARD_MAX_GROUPS = 5


@dataclass(frozen=True, slots=True)
class ScenePlan:
    """One planned conversation: a cast huddle with its own setting and stakes."""

    cast: tuple[str, ...]
    setting: str
    stakes: str
    mood: str


_SYSTEM = """\
You are the SHOWRUNNER for a generative Game of Thrones political simulation.

You are handed (1) a dramatic PREMISE and (2) a ROSTER of characters who are
available right now. Your job: stage the premise as several SIMULTANEOUS
conversations happening at the same moment in different corners of the castle —
the way an episode cuts between a throne-room confrontation, a whispered pact in
an alcove, and two siblings sparring in a courtyard.

Return STRICT JSON:
{
  "groups": [
    {
      "cast": ["<key>", "<key>", ...],
      "setting": "<where & when this huddle happens, one vivid sentence>",
      "stakes": "<what each person in it wants, one sentence>",
      "mood": "friendly" | "tense" | "hostile"
    }
  ]
}

RULES:
- Use ONLY character keys from the roster, spelled exactly.
- Each group has 2 to 4 characters. No character appears in more than one group.
- Make the groupings dramatically motivated by the premise and by who these
  people are to each other (allies scheme together, rivals confront each other).
- Write the setting and stakes in-world, specific, and tied to the premise.
- Pick mood from the relationship: warm/conspiratorial = friendly, wary/probing
  = tense, openly antagonistic = hostile.
- Prefer fewer, richer groups over many thin ones.
"""


@weave.op
def plan_scenes(
    premise: str,
    roster: list[dict],
    *,
    max_groups: int = DEFAULT_MAX_GROUPS,
    episode: str | None = None,
) -> list[ScenePlan]:
    """Decompose a premise into several concurrent :class:`ScenePlan`s.

    ``roster`` is a list of ``{"key", "name", "title"}`` dicts (the spawnable
    cast). The plan only references roster keys; the result is validated and
    clamped so a downstream council always gets a legal cast.
    """
    premise = (premise or "").strip()
    if not premise:
        raise ValueError("a premise is required to direct a scene")
    if not roster:
        raise ValueError("no characters available to stage")

    max_groups = max(1, min(int(max_groups), HARD_MAX_GROUPS))
    by_key = {c["key"]: c for c in roster}

    catalog = "\n".join(
        f"  - {c['key']}: {c['name']}" + (f" — {c['title']}" if c.get("title") else "")
        for c in roster
    )
    user = (
        f"PREMISE:\n{premise}\n\n"
        + (f"Story moment: {episode}\n\n" if episode else "")
        + f"ROSTER (use these keys exactly):\n{catalog}\n\n"
        f"Stage this as up to {max_groups} simultaneous conversations."
    )

    raw = llm.complete_json(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}]
    )
    return _parse(raw, by_key=by_key, max_groups=max_groups)


def _parse(raw: dict, *, by_key: dict[str, dict], max_groups: int) -> list[ScenePlan]:
    groups_raw = raw.get("groups")
    if not isinstance(groups_raw, list):
        return []

    plans: list[ScenePlan] = []
    used: set[str] = set()

    for entry in groups_raw:
        if not isinstance(entry, dict):
            continue
        # Dedupe cast, drop unknown keys and anyone already placed in a group.
        cast: list[str] = []
        seen: set[str] = set()
        for key in entry.get("cast", []) or []:
            if not isinstance(key, str):
                continue
            if key in by_key and key not in seen and key not in used:
                seen.add(key)
                cast.append(key)
        if len(cast) < MIN_GROUP:
            continue
        cast = cast[:MAX_GROUP]
        used.update(cast)

        mood = entry.get("mood")
        if mood not in _MOODS:
            mood = _DEFAULT_MOOD

        setting = (entry.get("setting") or "").strip() or "a charged meeting at court"
        stakes = (
            (entry.get("stakes") or "").strip()
            or "each means to leave the room stronger than they entered it."
        )

        plans.append(
            ScenePlan(cast=tuple(cast), setting=setting, stakes=stakes, mood=mood)
        )
        if len(plans) >= max_groups:
            break

    return plans
