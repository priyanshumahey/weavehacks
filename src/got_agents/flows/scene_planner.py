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


# --- Act planning (episodic continuation) ---------------------------------
#
# An episode is an ordered sequence of ACTS. Act 0 opens (uses ``plan_scenes``);
# later acts CONTINUE from what just happened — the same cast re-forms into new
# huddles as alliances converge, the wronged confront the wrongdoer, and side
# deals peel off. ``plan_act`` plans the groups for one act, given a digest of
# the prior acts so the staging escalates instead of resetting.

# Narrative role of an act by its position in the episode.
_ACT_ROLES: dict[str, str] = {
    "opening": (
        "the OPENING — establish where everyone stands. Stage the premise as "
        "distinct huddles that plant the conflicts the rest of the episode will "
        "pay off."
    ),
    "rising": (
        "RISING ACTION — the situation sharpens. RE-FORM the groups from the last "
        "act: someone crosses the room to confront a rival, two who spoke "
        "separately now conspire together, a pair splits as trust breaks. Move "
        "people so the conflicts collide."
    ),
    "turn": (
        "the TURN — alliances harden and betrayals surface. Bring the colliding "
        "threads into fewer, larger, higher-stakes confrontations. People who "
        "schemed apart should now face each other."
    ),
    "resolution": (
        "the RESOLUTION — consequences land. Stage the final reckonings that "
        "settle (or shatter) what the episode built. Favor fewer, decisive "
        "scenes over many small ones."
    ),
}


def act_role(act_index: int, total_acts: int) -> str:
    """The narrative role key for an act at ``act_index`` of ``total_acts``."""
    if act_index <= 0:
        return "opening"
    if act_index >= total_acts - 1:
        return "resolution"
    # Middle acts: the first is rising, a later-middle act is the turn.
    midpoint = total_acts / 2
    return "turn" if act_index >= midpoint else "rising"


_CONTINUATION_SYSTEM = """\
You are the SHOWRUNNER for a generative Game of Thrones political simulation,
staging ONE ACT of an ongoing episode.

You are handed (1) the episode PREMISE, (2) the ROSTER of characters present,
(3) WHAT JUST HAPPENED in the previous act(s), and (4) this act's dramatic ROLE.
Your job: stage this act as several SIMULTANEOUS conversations that CONTINUE the
story — the characters carry forward what they just said, did, and learned. Do
NOT reset to the opening situation.

Return STRICT JSON:
{
  "groups": [
    {
      "cast": ["<key>", "<key>", ...],
      "setting": "<where & when this huddle happens now, one vivid sentence that
                   reflects what just happened>",
      "stakes": "<what each person wants in THIS act, given what just changed>",
      "mood": "friendly" | "tense" | "hostile"
    }
  ]
}

RULES:
- Use ONLY character keys from the roster, spelled exactly.
- Each group has 2 to 4 characters. No character appears in more than one group.
- RE-FORM the groupings from last act to fit the new situation: let allies who
  schemed apart converge, let the wronged seek out who wronged them, let a pair
  fracture. Movement and regrouping is the point.
- Make settings and stakes explicitly continue from WHAT JUST HAPPENED — name
  the alliance that formed, the accusation that landed, the secret that spread.
- Pick mood from the live relationship, and let it escalate across the episode.
- Prefer fewer, richer, higher-stakes groups as the episode progresses.
"""


@weave.op
def plan_act(
    premise: str,
    roster: list[dict],
    *,
    act_index: int,
    total_acts: int,
    prior_digest: str | None = None,
    max_groups: int = DEFAULT_MAX_GROUPS,
    episode: str | None = None,
) -> list[ScenePlan]:
    """Plan the concurrent groups for one act of an episode.

    Act 0 (no ``prior_digest``) opens the episode like :func:`plan_scenes`. Later
    acts continue from ``prior_digest`` — a compact record of what the previous
    act(s) said and did — so the staging escalates and the cast re-forms instead
    of resetting. Returns validated :class:`ScenePlan`s (cast clamped to roster).
    """
    premise = (premise or "").strip()
    if not premise:
        raise ValueError("a premise is required to direct an act")
    if not roster:
        raise ValueError("no characters available to stage")

    max_groups = max(1, min(int(max_groups), HARD_MAX_GROUPS))
    by_key = {c["key"]: c for c in roster}
    role = act_role(act_index, total_acts)

    catalog = "\n".join(
        f"  - {c['key']}: {c['name']}" + (f" — {c['title']}" if c.get("title") else "")
        for c in roster
    )

    # Act 0 with no prior context is just the opening — reuse the opening system.
    if act_index <= 0 and not (prior_digest and prior_digest.strip()):
        user = (
            f"PREMISE:\n{premise}\n\n"
            + (f"Story moment: {episode}\n\n" if episode else "")
            + f"ROSTER (use these keys exactly):\n{catalog}\n\n"
            f"This is Act 1 of {total_acts} — {_ACT_ROLES['opening']}\n"
            f"Stage it as up to {max_groups} simultaneous conversations."
        )
        raw = llm.complete_json(
            [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": user}]
        )
        return _parse(raw, by_key=by_key, max_groups=max_groups)

    digest = (prior_digest or "").strip() or "(the previous act passed quietly)"
    user = (
        f"PREMISE:\n{premise}\n\n"
        + (f"Story moment: {episode}\n\n" if episode else "")
        + f"ROSTER (use these keys exactly):\n{catalog}\n\n"
        f"WHAT JUST HAPPENED (previous act(s)):\n{digest}\n\n"
        f"This is Act {act_index + 1} of {total_acts} — {_ACT_ROLES[role]}\n"
        f"Stage it as up to {max_groups} simultaneous conversations that continue "
        "directly from what just happened."
    )
    raw = llm.complete_json(
        [
            {"role": "system", "content": _CONTINUATION_SYSTEM},
            {"role": "user", "content": user},
        ]
    )
    return _parse(raw, by_key=by_key, max_groups=max_groups)


# --- Phase planning (continuous timeline) ---------------------------------
#
# A continuous episode plays on ONE clock with several conversations running
# concurrently across the map. ``plan_phase`` plans the threads for one PHASE —
# the next configuration of who-is-talking-to-whom-and-where — given where every
# character currently stands and what has happened so far. Unlike an act (one
# place, everyone re-forms at once), a phase lets each thread choose its own map
# LOCATION, so a character can break off and walk to the Wall while others keep
# scheming in the throne room. Movement between phases is derived downstream.


@dataclass(frozen=True, slots=True)
class PhaseThread:
    """One planned conversation in a phase: a cast huddle with a map location."""

    cast: tuple[str, ...]
    setting: str
    stakes: str
    mood: str
    location: str


_PHASE_SYSTEM = """\
You are the SHOWRUNNER for a generative Game of Thrones political simulation that
plays as one CONTINUOUS, BUSY scene — MANY conversations happen AT THE SAME TIME
across the map, characters finish talking and walk off to find someone else, and
new conversations form when they arrive. Think of an ensemble episode where the
camera could cut to any corner of the world and find people scheming. You are
staging ONE PHASE: the next configuration of who is talking to whom, and WHERE.

You are handed (1) the PREMISE, (2) the ROSTER, (3) the LOCATIONS available,
(4) WHERE EACH CHARACTER CURRENTLY STANDS, and (5) WHAT JUST HAPPENED. Decide the
conversations happening RIGHT NOW. Characters move with MOTIVE: someone exiled to
the Wall walks to the Wall; an ally crosses the room to join a plot; a lord
storms over to confront a rival; a spy slips away to whisper to a patron.

Return STRICT JSON:
{
  "threads": [
    {
      "cast": ["<key>", "<key>", ...],
      "location": "<location id from the list>",
      "setting": "<where & when, one vivid sentence — reflect any travel>",
      "stakes": "<what each wants in this conversation, given what just changed>",
      "mood": "friendly" | "tense" | "hostile"
    }
  ]
}

HARD REQUIREMENTS — the scene must feel ALIVE, not a single talking-heads pair:
- Use ONLY character keys from the roster and ONLY location ids from the list,
  spelled exactly.
- Each thread has 2 to 4 characters. No character appears in more than one
  thread in this phase.
- Place AS MANY present characters as you sensibly can into conversations this
  phase — aim to use almost everyone. Idle characters are wasted; only leave
  someone out if it is dramatically pointed (and bring them back soon).
- Run MULTIPLE THREADS CONCURRENTLY. If 4+ characters are present you MUST stage
  at least 2 simultaneous threads; with 6+ prefer 3. Do not collapse the whole
  cast into one conversation.
- MOVE people and SPREAD them across DIFFERENT locations when the story warrants
  it — do not park everyone in one room every phase. If a thread's location
  differs from where its members stand, that means they WALK there; make the
  setting/stakes reflect the journey and why.
- Re-form groups from phase to phase: split a pair, merge two schemers, send one
  person across the map. The regrouping and movement IS the show.
- Continue directly from what just happened: name the alliance, the exile, the
  accusation that drives each thread. Do NOT reset and do NOT simply repeat the
  previous phase's pairing.
- Let mood escalate as the episode builds (tense → hostile as lines harden).
"""


@weave.op
def plan_phase(
    premise: str,
    roster: list[dict],
    *,
    locations: list[dict],
    character_locations: dict[str, str],
    phase_index: int,
    total_phases: int,
    prior_digest: str | None = None,
    max_threads: int = DEFAULT_MAX_GROUPS,
    episode: str | None = None,
) -> list[PhaseThread]:
    """Plan the concurrent conversation threads for one phase of a continuous
    episode.

    ``locations`` is ``[{"id", "label"}]`` of the map locations a thread may use.
    ``character_locations`` maps each present character key to the id of where it
    currently stands, so the planner can move people with motive. Phase 0 (no
    digest) opens the episode; later phases continue from ``prior_digest`` and
    re-form the threads. Returns validated :class:`PhaseThread`s.
    """
    premise = (premise or "").strip()
    if not premise:
        raise ValueError("a premise is required to direct a phase")
    if not roster:
        raise ValueError("no characters available to stage")
    if not locations:
        raise ValueError("at least one location is required")

    max_threads = max(1, min(int(max_threads), HARD_MAX_GROUPS))
    by_key = {c["key"]: c for c in roster}
    location_ids = {loc["id"] for loc in locations}
    default_location = locations[0]["id"]
    role = act_role(phase_index, total_phases)

    catalog = "\n".join(
        f"  - {c['key']}: {c['name']}" + (f" — {c['title']}" if c.get("title") else "")
        for c in roster
    )
    loc_catalog = "\n".join(f"  - {loc['id']}: {loc['label']}" for loc in locations)
    where = "\n".join(
        f"  - {by_key[k]['name'] if k in by_key else k}: {character_locations.get(k, default_location)}"
        for k in character_locations
    ) or "  (everyone is gathered together)"

    digest = (prior_digest or "").strip() or "(the episode is just beginning)"
    role_line = _ACT_ROLES.get(role, "")

    # Numeric concurrency target from how many characters are present, so the
    # planner spreads the cast instead of collapsing to one pair.
    present_count = len(character_locations) or len(roster)
    target_threads = max(1, min(max_threads, present_count // 2))
    if present_count >= 6:
        target_threads = min(max_threads, max(target_threads, 3))
    elif present_count >= 4:
        target_threads = min(max_threads, max(target_threads, 2))
    loc_count = len(locations)
    spread_line = (
        f"Spread conversations across at least {min(2, loc_count)} different "
        f"locations when the story allows.\n"
        if loc_count > 1
        else ""
    )

    user = (
        f"PREMISE:\n{premise}\n\n"
        + (f"Story moment: {episode}\n\n" if episode else "")
        + f"ROSTER (use these keys exactly):\n{catalog}\n\n"
        f"LOCATIONS (use these ids exactly):\n{loc_catalog}\n\n"
        f"WHERE EACH CHARACTER CURRENTLY STANDS:\n{where}\n\n"
        f"WHAT JUST HAPPENED:\n{digest}\n\n"
        f"This is Phase {phase_index + 1} of {total_phases} — {role_line}\n"
        f"{present_count} characters are present. Stage {target_threads} "
        f"CONCURRENT conversations this phase (up to {max_threads}), placing as "
        f"many of them as you can.\n"
        f"{spread_line}"
        "Re-form the groups from last phase — do not repeat the same pairing."
    )
    raw = llm.complete_json(
        [
            {"role": "system", "content": _PHASE_SYSTEM},
            {"role": "user", "content": user},
        ]
    )
    return _parse_phase(
        raw,
        by_key=by_key,
        location_ids=location_ids,
        default_location=default_location,
        max_threads=max_threads,
    )


def _parse_phase(
    raw: dict,
    *,
    by_key: dict[str, dict],
    location_ids: set[str],
    default_location: str,
    max_threads: int,
) -> list[PhaseThread]:
    threads_raw = raw.get("threads")
    if not isinstance(threads_raw, list):
        return []

    threads: list[PhaseThread] = []
    used: set[str] = set()

    for entry in threads_raw:
        if not isinstance(entry, dict):
            continue
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

        location = entry.get("location")
        if location not in location_ids:
            location = default_location

        setting = (entry.get("setting") or "").strip() or "a charged meeting at court"
        stakes = (
            (entry.get("stakes") or "").strip()
            or "each means to leave the room stronger than they entered it."
        )

        threads.append(
            PhaseThread(
                cast=tuple(cast),
                setting=setting,
                stakes=stakes,
                mood=mood,
                location=location,
            )
        )
        if len(threads) >= max_threads:
            break

    return threads

