"""Replay contract (L5) — the chronicle shape the Phaser world consumes.

The render phase (§0 #6): the simulation already wrote a chronicle; the game
*replays* it. This is the **locked interface** between the Python "mind" and the
TypeScript "body" — a thin, stable, presentation-focused view of a chronicle:

- every speaker is resolved to a stable **character key** plus a **charset**
  sprite hint, so the world knows which sprite to spawn;
- turns carry both the public line and the private intent (the body decides
  whether/when to reveal the scheme);
- keys are camelCased for idiomatic TS consumption.

Pure transform over a chronicle ``dict`` (``episode_chronicle.to_dict``) — no
Redis, no LLM — so it runs on any saved chronicle.
"""

from __future__ import annotations

import json
from pathlib import Path

from got_agents.characters import charset_for, key_for_name

REPLAY_VERSION = 1
_REPLAY_ROOT = Path("logs") / "replays"


def _cast_entry(name: str) -> dict:
    key = key_for_name(name) or name.strip().lower().replace(" ", "_")
    return {
        "key": key,
        "name": name,
        "charset": charset_for(key) or name.strip().lower(),
    }


def to_replay(chronicle: dict) -> dict:
    """Transform a chronicle dict into the world-facing replay contract."""
    # Stable cast list (first appearance order) with sprite hints.
    cast: list[dict] = []
    seen: set[str] = set()

    def _key(name: str) -> str:
        return key_for_name(name) or name.strip().lower().replace(" ", "_")

    def _note(name: str) -> str:
        key = _key(name)
        if key not in seen:
            seen.add(key)
            cast.append(_cast_entry(name))
        return key

    scenes = []
    for scene in chronicle.get("scenes", []):
        present = [_note(c) if " " in c else c for c in scene.get("cast", [])]
        turns = []
        for turn in scene.get("turns", []):
            speaker_name = turn["speaker"]
            target_name = turn.get("target")
            turns.append(
                {
                    "speaker": _note(speaker_name),
                    "speakerName": speaker_name,
                    "round": turn.get("round", 1),
                    "action": turn.get("action", "speak"),
                    "target": _key(target_name) if target_name else None,
                    "targetName": target_name,
                    "dialogue": turn.get("dialogue", ""),
                    "publicStance": turn.get("public_stance", ""),
                    "privateIntent": turn.get("private_intent", ""),
                    "thinking": turn.get("thinking", ""),
                }
            )
        scenes.append(
            {
                "index": scene.get("index", len(scenes)),
                "setting": scene.get("setting", ""),
                "stakes": scene.get("stakes", ""),
                "cast": present,
                "turns": turns,
                "effects": [dict(e) for e in scene.get("effects", [])],
            }
        )

    return {
        "version": REPLAY_VERSION,
        "episode": chronicle.get("episode", ""),
        "title": chronicle.get("title", ""),
        "cast": cast,
        "scenes": scenes,
        "worldStart": chronicle.get("world_start", {}),
        "worldEnd": chronicle.get("world_end", {}),
        "reflections": chronicle.get("reflections", {}),
    }


def write_replay(chronicle: dict, *, root: Path | None = None) -> Path:
    """Write the replay contract JSON for a chronicle; return the path."""
    replay = to_replay(chronicle)
    out_dir = root or _REPLAY_ROOT
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{replay['episode'] or 'episode'}.json"
    path.write_text(json.dumps(replay, indent=2, ensure_ascii=False))
    return path
