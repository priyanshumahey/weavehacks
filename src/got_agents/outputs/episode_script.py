"""Episode-script contract (L5b) — the *continuous timeline* the world plays.

Where :mod:`ensemble_contract` emits concurrent groups on one lockstep clock,
this emits a flat list of **threads** (conversations) played on one continuous
clock with arrival-driven concurrency:

* Each thread has its own map ``locationId`` + ``anchor``, ``cast``, ``turns``,
  and ``mood``.
* Each thread lists ``dependsOn`` — the thread ids that must finish before it can
  begin. Dependencies are DERIVED from per-character ordering: a character's
  thread *N* depends on their thread *N-1*. That single rule guarantees a
  character is never in two threads at once and makes "break off and walk over
  to someone else" emerge naturally.

The world plays it by walking each thread's cast to its anchor (across locations
if needed), starting the thread when they arrive, and running its turns; threads
finish at different times because they have different turn counts. No global
lockstep, no post-scene mingle.

A ``learning`` block carries evidence the agents grew: per-thread drive deltas +
emotion, a per-character drive trajectory, and end-of-episode reflections.

Pure transform over a ``script_chronicle`` dict (produced by the continuous
director) — no Redis, no LLM. Mirrors ``world/src/replay/episodeScriptTypes.ts``.
"""

from __future__ import annotations

import json
from pathlib import Path

from got_agents.outputs.ensemble_contract import (
    _PRESET_ANCHORS,
    _cast_entry,
    _display_name,
    _short_label,
    _to_key,
)

EPISODE_SCRIPT_VERSION = 2
_SCRIPT_ROOT = Path("logs") / "scripts"


def _thread_turns(raw_turns: list[dict]) -> list[dict]:
    """Transform chronicle turns into world-facing camelCase turns."""
    turns: list[dict] = []
    for turn in raw_turns:
        speaker = _to_key(turn["speaker"])
        raw_target = turn.get("target")
        turns.append(
            {
                "speaker": speaker,
                "speakerName": _display_name(speaker),
                "dialogue": turn.get("dialogue", ""),
                "publicStance": turn.get("public_stance", ""),
                "privateIntent": turn.get("private_intent", ""),
                "thinking": turn.get("thinking", ""),
                "action": turn.get("action", "speak"),
                "target": _to_key(raw_target) if raw_target else None,
            }
        )
    return turns


def _anchor_for_location(slot: int) -> dict:
    """Spread concurrent threads at one location across preset anchors."""
    x, y = _PRESET_ANCHORS[slot % len(_PRESET_ANCHORS)]
    return {"x": x, "y": y}


def to_episode_script(
    script_chronicle: dict,
    *,
    default_location: str | None = None,
) -> dict:
    """Transform a ``script_chronicle`` dict into the episode-script contract.

    ``script_chronicle`` shape::

        {
          "episode", "title", "premise",
          "threads": [
            {"id"?, "phase"?, "location", "mood", "setting", "stakes",
             "cast": [key...],
             "turns": [{round, speaker, action, target, dialogue,
                        public_stance, private_intent, thinking}],
             "driveDeltas"?: {key: {drive: delta}},
             "emotion"?: {key: word}},
            ...
          ],
          "learning"?: {"driveTrajectory", "reflections"},
        }

    Thread ``id``s are assigned if missing; ``dependsOn`` is derived from
    per-character ordering. Anchors spread concurrent same-location threads.
    """
    raw_threads = script_chronicle.get("threads", [])

    # First pass: assign ids and per-location anchor slots.
    location_slot: dict[str, int] = {}
    prepared: list[dict] = []
    for index, thread in enumerate(raw_threads):
        tid = thread.get("id") or f"thread-{index}"
        location = thread.get("location") or default_location or "throne-room"
        slot = location_slot.get(location, 0)
        location_slot[location] = slot + 1
        prepared.append({"thread": thread, "id": tid, "location": location, "slot": slot})

    # Second pass: derive per-character dependencies (a character's thread N
    # depends on their thread N-1) and build the world-facing thread objects.
    last_thread_of: dict[str, str] = {}
    cast_keys_seen: list[str] = []
    cast_seen: set[str] = set()
    threads_out: list[dict] = []

    for item in prepared:
        thread = item["thread"]
        tid = item["id"]
        location = item["location"]

        turns = _thread_turns(thread.get("turns", []))

        # Cast = declared cast, then any speakers, in first-appearance order.
        cast_keys: list[str] = []
        seen: set[str] = set()
        for raw in list(thread.get("cast", [])) + [t["speaker"] for t in turns]:
            key = _to_key(raw)
            if key not in seen:
                seen.add(key)
                cast_keys.append(key)

        depends_on: list[str] = []
        dep_seen: set[str] = set()
        for key in cast_keys:
            prev = last_thread_of.get(key)
            if prev and prev not in dep_seen:
                dep_seen.add(prev)
                depends_on.append(prev)
        for key in cast_keys:
            last_thread_of[key] = tid
            if key not in cast_seen:
                cast_seen.add(key)
                cast_keys_seen.append(key)

        thread_obj = {
            "id": tid,
            "phase": int(thread.get("phase", 0)),
            "locationId": location,
            "anchor": _anchor_for_location(item["slot"]),
            "mood": thread.get("mood") or "tense",
            "label": _short_label(thread.get("setting", ""), len(threads_out)),
            "topic": (thread.get("setting") or "").strip(),
            "stakes": (thread.get("stakes") or "").strip(),
            "cast": [_cast_entry(k) for k in cast_keys],
            "dependsOn": depends_on,
            "turns": turns,
        }
        if thread.get("driveDeltas"):
            thread_obj["driveDeltas"] = {
                _to_key(k): v for k, v in thread["driveDeltas"].items()
            }
        if thread.get("emotion"):
            thread_obj["emotion"] = {
                _to_key(k): v for k, v in thread["emotion"].items()
            }
        threads_out.append(thread_obj)

    return {
        "version": EPISODE_SCRIPT_VERSION,
        "kind": "episode-script",
        "title": script_chronicle.get("title", ""),
        "premise": script_chronicle.get("premise", ""),
        "episode": script_chronicle.get("episode", ""),
        "cast": [_cast_entry(k) for k in cast_keys_seen],
        "threads": threads_out,
        "learning": script_chronicle.get("learning", {}),
    }


def write_episode_script(
    script_chronicle: dict,
    *,
    root: Path | None = None,
    name: str | None = None,
) -> Path:
    """Write the episode-script JSON for a chronicle; return the path."""
    script = to_episode_script(script_chronicle)
    out_dir = root or _SCRIPT_ROOT
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = name or script_chronicle.get("episode") or "episode-script"
    path = out_dir / f"{stem}.json"
    path.write_text(json.dumps(script, indent=2, ensure_ascii=False))
    return path
