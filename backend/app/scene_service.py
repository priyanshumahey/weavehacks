"""Scene service — stage a one-off council scene and return it as an ensemble.

The "set up a new scene" path: the client picks a cast, a setting, and stakes;
this loads each character as a Lord (rewound to the chosen episode), runs a
single :func:`run_council` scene, then transforms the transcript into the
**ensemble contract** the Phaser world plays (one conversation group, pinned to
a map location). Reuses the same Lord cognition behind chat and the offline sim.

Live compute: needs Redis + ``OPENAI_API_KEY`` and takes a few seconds per
scene (one ``act`` per turn). The result is a self-contained ensemble JSON, so
the world can replay it without further backend calls.
"""

from __future__ import annotations

from got_agents.agent.lord import Lord
from got_agents.characters import charset_for, get_character, known
from got_agents.flows.council import run_council
from got_agents.flows.encounter_planner import (
    DEFAULT_MAX_ENCOUNTERS,
    EncounterPlan,
    plan_encounters,
)
from got_agents.flows.scene_planner import (
    DEFAULT_MAX_GROUPS,
    HARD_MAX_GROUPS,
    ScenePlan,
    plan_scenes,
)
from got_agents.outputs.ensemble_contract import to_ensemble

# Episode rewind points, shared with the chat service.
EPISODES: list[str] = [f"s1e{e}" for e in range(1, 11)]
DEFAULT_EPISODE = "s1e1"

# Map locations the world understands (mirrors world/src/types/location.ts).
LOCATIONS: list[dict] = [
    {"id": "throne-room", "label": "Throne Room"},
    {"id": "winterfell", "label": "Winterfell Courtyard"},
]
_LOCATION_IDS = {loc["id"] for loc in LOCATIONS}
DEFAULT_LOCATION = "throne-room"

MAX_CAST = 5
MIN_CAST = 2
DEFAULT_MAX_ROUNDS = 2

# Charsets available as sprites in the world (world/charsets/sprites/<name>).
# Resolved lazily from disk so the roster only offers spawnable characters.
_AVAILABLE_CHARSETS: set[str] | None = None


def _available_charsets() -> set[str]:
    global _AVAILABLE_CHARSETS
    if _AVAILABLE_CHARSETS is None:
        from pathlib import Path

        sprites = (
            Path(__file__).resolve().parents[2] / "world" / "charsets" / "sprites"
        )
        if sprites.exists():
            _AVAILABLE_CHARSETS = {
                p.name for p in sprites.iterdir() if p.is_dir()
            }
        else:
            _AVAILABLE_CHARSETS = set()
    return _AVAILABLE_CHARSETS


_HONORIFIC_PREFIXES = (
    "ser ",
    "lord ",
    "lady ",
    "maester ",
    "grand maester ",
    "septa ",
    "septon ",
    "king ",
    "queen ",
    "prince ",
    "princess ",
    "khal ",
    "khaleesi ",
)


def _resolve_charset(key: str) -> str | None:
    """The world sprite-dir charset for a key, or ``None`` if not spawnable.

    ``charset_for`` may return an honorific-prefixed name ("ser jorah mormont")
    whose sprite dir is the bare name ("jorah mormont"); try the stripped form
    too so those characters are still offered.
    """
    charset = charset_for(key)
    if not charset:
        return None
    available = _available_charsets()
    if charset in available:
        return charset
    stripped = charset
    for prefix in _HONORIFIC_PREFIXES:
        if stripped.startswith(prefix):
            stripped = stripped[len(prefix) :]
            break
    if stripped in available:
        return stripped
    return None


def roster() -> list[dict]:
    """Characters that can be staged: have a core AND a world sprite."""
    out: list[dict] = []
    for key in known():
        charset = _resolve_charset(key)
        if charset is None:
            continue
        genome = get_character(key).genome
        out.append(
            {
                "key": key,
                "name": genome.name,
                "title": genome.title,
                "charset": charset,
                "topDrives": [
                    {"name": n, "value": v}
                    for n, v in sorted(
                        genome.drive_params.items(),
                        key=lambda kv: kv[1],
                        reverse=True,
                    )[:3]
                ],
            }
        )
    out.sort(key=lambda c: c["name"])
    return out


def options() -> dict:
    """Static setup options for the scene-builder UI."""
    return {
        "episodes": [
            {"id": ep, "label": ep.upper().replace("E", " · E")} for ep in EPISODES
        ],
        "locations": LOCATIONS,
        "minCast": MIN_CAST,
        "maxCast": MAX_CAST,
    }


def build_scene(
    cast: list[str],
    *,
    setting: str,
    stakes: str,
    episode: str = DEFAULT_EPISODE,
    location: str = DEFAULT_LOCATION,
    max_rounds: int = DEFAULT_MAX_ROUNDS,
) -> dict:
    """Run a single council scene and return it as a one-group ensemble.

    Raises ``KeyError`` for an unknown character key and ``ValueError`` for bad
    cast size or an unspawnable character.
    """
    if not (MIN_CAST <= len(cast) <= MAX_CAST):
        raise ValueError(
            f"a scene needs {MIN_CAST}–{MAX_CAST} characters; got {len(cast)}"
        )
    if len(set(cast)) != len(cast):
        raise ValueError("duplicate characters in the cast")
    if episode not in EPISODES:
        episode = DEFAULT_EPISODE
    if location not in _LOCATION_IDS:
        location = DEFAULT_LOCATION
    max_rounds = max(1, min(int(max_rounds), 4))

    setting = setting.strip() or "a tense meeting at court"
    stakes = stakes.strip() or "each means to leave the room stronger than they entered it."

    lords: list[Lord] = []
    for key in cast:
        get_character(key)  # validates key (raises KeyError)
        if _resolve_charset(key) is None:
            raise ValueError(f"character {key!r} has no world sprite")
        lords.append(Lord.load(key, at_time=episode))

    scene = _run_one_council(
        cast, lords, setting=setting, stakes=stakes, max_rounds=max_rounds
    )
    chronicle = {
        "episode": episode,
        "title": setting,
        "scenes": [scene],
    }
    return _with_sprite_charsets(to_ensemble(chronicle, location_overrides={0: location}))


def _with_sprite_charsets(ensemble: dict) -> dict:
    """Rewrite every cast member's charset to a sprite the world can load.

    ``to_ensemble`` derives charsets from ``charset_for`` (which may keep an
    honorific, e.g. "lord varys"), but the world's sprite directory is the bare
    name ("varys"). Reuse the roster's sprite-verified resolver so no character
    renders as a missing-texture box.
    """
    for group in ensemble.get("groups", []):
        for member in group.get("cast", []):
            resolved = _resolve_charset(member.get("key", ""))
            if resolved:
                member["charset"] = resolved
    return ensemble


def _run_one_council(
    cast: list[str],
    lords: list[Lord],
    *,
    setting: str,
    stakes: str,
    max_rounds: int,
) -> dict:
    """Run a single council and return it as a chronicle *scene* dict."""
    transcript = run_council(
        lords,
        setting=setting,
        stakes=stakes,
        max_rounds=max_rounds,
        appraise=False,
    )

    name_to_key = {lord.genome.name: cast[i] for i, lord in enumerate(lords)}
    turns = []
    for turn in transcript.turns:
        d = turn.decision
        turns.append(
            {
                "round": turn.round,
                "speaker": name_to_key.get(turn.speaker, turn.speaker),
                "action": d.action,
                "target": d.target,
                "dialogue": d.dialogue,
                "public_stance": d.public_stance,
                "private_intent": d.private_intent,
                "thinking": d.thinking,
            }
        )

    return {
        "index": 0,
        "setting": setting,
        "stakes": stakes,
        "cast": list(cast),
        "turns": turns,
        "effects": [],
    }


def build_episode(
    premise: str,
    *,
    cast_pool: list[str] | None = None,
    episode: str = DEFAULT_EPISODE,
    location: str = DEFAULT_LOCATION,
    max_groups: int = DEFAULT_MAX_GROUPS,
    max_rounds: int = DEFAULT_MAX_ROUNDS,
    encounters: int = DEFAULT_MAX_ENCOUNTERS,
) -> dict:
    """Direct a whole *moment*: one premise → several concurrent conversations.

    A showrunner LLM call decomposes the premise into spatially/politically
    distinct huddles (each a legal council cast drawn from the spawnable roster);
    every huddle is then run as its own council (concurrently) and the results
    are stitched into a multi-group ensemble the world plays at once.

    ``cast_pool`` optionally restricts the director to a chosen set of character
    keys; when empty the whole spawnable roster is available. ``encounters`` is
    how many incidental two-person meetings to precompute for the post-scene
    mingle (0 to skip).

    Raises ``ValueError`` if the premise is empty or the planner finds no viable
    grouping.
    """
    premise = (premise or "").strip()
    if not premise:
        raise ValueError("a premise is required")
    if episode not in EPISODES:
        episode = DEFAULT_EPISODE
    if location not in _LOCATION_IDS:
        location = DEFAULT_LOCATION
    max_groups = max(1, min(int(max_groups), HARD_MAX_GROUPS))
    max_rounds = max(1, min(int(max_rounds), 4))
    encounters = max(0, int(encounters))

    available = roster()
    if cast_pool:
        pool = set(cast_pool)
        chosen = [c for c in available if c["key"] in pool]
        if len(chosen) < 2:
            raise ValueError(
                "choose at least two spawnable characters for the cast pool, "
                "or leave it empty to let the director cast freely"
            )
        available = chosen

    plans = plan_scenes(premise, available, max_groups=max_groups, episode=episode)
    if not plans:
        raise ValueError(
            "the director could not stage this premise; try naming characters or "
            "a clearer situation"
        )

    scenes = _run_plans(plans, episode=episode, max_rounds=max_rounds)

    chronicle = {
        "episode": episode,
        "title": premise[:80],
        "scenes": scenes,
    }
    mood_overrides = {i: plan.mood for i, plan in enumerate(plans)}
    location_overrides = {i: location for i in range(len(plans))}
    ensemble = _with_sprite_charsets(
        to_ensemble(
            chronicle,
            mood_overrides=mood_overrides,
            location_overrides=location_overrides,
        )
    )

    # Precompute the post-scene mingle: a few incidental two-person meetings
    # among the present cast, baked into the saved ensemble for deterministic
    # replay. Cross-group pairings are favoured by the planner.
    if encounters > 0:
        present = sorted({key for plan in plans for key in plan.cast})
        present_roster = [c for c in available if c["key"] in present]
        enc_plans = plan_encounters(
            premise, present_roster, max_encounters=encounters, episode=episode
        )
        baked = _run_encounters(enc_plans, episode=episode)
        if baked:
            ensemble["encounters"] = baked

    return ensemble


def _run_encounters(plans: list[EncounterPlan], *, episode: str) -> list[dict]:
    """Run each planned meeting as a short two-person council, concurrently.

    Each encounter is a one-round council rendered into the same camelCase shape
    as an ensemble group (plus a ``setting``), so the world can play it with the
    existing dialogue path.
    """
    if not plans:
        return []

    import concurrent.futures

    def run_one(index_plan: tuple[int, EncounterPlan]) -> tuple[int, dict]:
        index, plan = index_plan
        cast = list(plan.cast)
        lords = [Lord.load(key, at_time=episode) for key in cast]
        scene = _run_one_council(
            cast, lords, setting=plan.setting, stakes=plan.stakes, max_rounds=1
        )
        chronicle = {"episode": episode, "title": plan.setting, "scenes": [scene]}
        ens = _with_sprite_charsets(
            to_ensemble(chronicle, mood_overrides={0: plan.mood})
        )
        group = ens["groups"][0] if ens.get("groups") else {"cast": [], "turns": []}
        return index, {
            "id": f"encounter-{index}",
            "setting": plan.setting,
            "mood": plan.mood,
            "cast": group.get("cast", []),
            "turns": group.get("turns", []),
        }

    workers = min(len(plans), 4)
    results: dict[int, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for index, enc in pool.map(run_one, list(enumerate(plans))):
            results[index] = enc
    return [results[i] for i in range(len(plans))]


def _run_plans(
    plans: list[ScenePlan], *, episode: str, max_rounds: int
) -> list[dict]:
    """Run each planned group as a council, concurrently; return scene dicts.

    Lords are loaded inside each worker (one thread per group). Order is
    preserved so scene index matches plan index (for mood/anchor overrides).
    """
    import concurrent.futures

    def run_plan(index_plan: tuple[int, ScenePlan]) -> tuple[int, dict]:
        index, plan = index_plan
        cast = list(plan.cast)
        lords = [Lord.load(key, at_time=episode) for key in cast]
        scene = _run_one_council(
            cast,
            lords,
            setting=plan.setting,
            stakes=plan.stakes,
            max_rounds=max_rounds,
        )
        scene["index"] = index
        return index, scene

    workers = min(len(plans), 4)
    results: dict[int, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for index, scene in pool.map(run_plan, list(enumerate(plans))):
            results[index] = scene
    return [results[i] for i in range(len(plans))]
