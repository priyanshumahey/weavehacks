"""Ensemble replay contract (L5) — the *living world* shape the Phaser body plays.

Where :mod:`replay_contract` emits a single linear scene sequence, this emits the
**ensemble** form the world's ``ReplayScene`` consumes: several conversation
groups on one shared map, each pinned to a normalized ``anchor`` with a ``mood``
that drives its huddle radius. Each chronicle *scene* becomes one ensemble
*group*.

Pure transform over a chronicle ``dict`` (``episode_chronicle.to_dict``) — no
Redis, no LLM — so it runs on any saved chronicle. Mirrors
``world/src/replay/ensembleTypes.ts`` (camelCase keys for idiomatic TS).
"""

from __future__ import annotations

import json
from pathlib import Path

from got_agents.characters import charset_for, get_character, key_for_name

ENSEMBLE_VERSION = 1
_ENSEMBLE_ROOT = Path("logs") / "ensembles"

# Pre-placed anchors (normalized 0..1 playfield coords) that read well on the
# tall throne-room map. The first N are used for N groups; beyond that we fall
# back to a grid. Spread so huddles do not overlap.
_PRESET_ANCHORS: tuple[tuple[float, float], ...] = (
    (0.50, 0.28),
    (0.30, 0.55),
    (0.70, 0.62),
    (0.34, 0.80),
    (0.68, 0.30),
    (0.50, 0.72),
    (0.22, 0.34),
    (0.78, 0.82),
)

# Typed-core actions that colour a scene's mood.
_HOSTILE_ACTIONS = frozenset({"accuse"})
_TENSE_ACTIONS = frozenset({"share_secret", "swear_oath"})


def _to_key(ident: str) -> str:
    """Normalize an identifier to a stable character key.

    Chronicles are inconsistent: a beat's ``cast`` lists keys (``"ned"``) while a
    turn's ``speaker`` may be a display name (``"Eddard Stark"``). Resolve both to
    one key so cast lists do not duplicate and turn speakers match the cast.
    """
    ident = (ident or "").strip()
    if not ident:
        return ident
    mapped = key_for_name(ident)
    if mapped:
        return mapped
    # Keys never contain spaces; a spaced identifier is an unmapped display name.
    if " " in ident:
        return ident.lower().replace(" ", "_")
    return ident


def _display_name(key: str) -> str:
    """Resolve a character key to its display name (falls back to the key)."""
    try:
        return get_character(key).genome.name
    except KeyError:
        return key.replace("_", " ").title()


def _cast_entry(key: str) -> dict:
    return {
        "key": key,
        "name": _display_name(key),
        "charset": charset_for(key) or key.replace("_", " "),
    }


def _anchor_for(index: int, total: int) -> dict:
    if index < len(_PRESET_ANCHORS):
        x, y = _PRESET_ANCHORS[index]
        return {"x": x, "y": y}
    # Grid fallback for many groups.
    cols = max(1, round(total**0.5))
    col = index % cols
    row = index // cols
    rows = max(1, (total + cols - 1) // cols)
    x = (col + 0.5) / cols
    y = (row + 0.5) / rows
    return {"x": round(x, 3), "y": round(y, 3)}


def _mood_for(turns: list[dict]) -> str:
    actions = {t.get("action", "speak") for t in turns}
    if actions & _HOSTILE_ACTIONS:
        return "hostile"
    if actions & _TENSE_ACTIONS:
        return "tense"
    return "friendly"


def _short_label(setting: str, index: int) -> str:
    """A concise group label derived from the scene setting."""
    text = (setting or "").strip()
    if not text:
        return f"Scene {index + 1}"
    # Take the clause up to the first comma / em-dash, capped in length.
    for sep in ("—", " - ", ","):
        if sep in text:
            text = text.split(sep, 1)[0].strip()
            break
    text = text[:48].strip()
    return text[:1].upper() + text[1:] if text else f"Scene {index + 1}"


def to_ensemble(
    chronicle: dict,
    *,
    mood_overrides: dict[int, str] | None = None,
    anchors: dict[int, dict] | None = None,
    location_overrides: dict[int, str] | None = None,
) -> dict:
    """Transform a chronicle dict into the world-facing ensemble contract.

    One chronicle scene -> one ensemble group. ``mood_overrides`` /``anchors`` /
    ``location_overrides`` let a caller (e.g. the backend, which knows deception
    scores or map intent) override the per-scene heuristics by scene index.
    """
    scenes = chronicle.get("scenes", [])
    total = len(scenes)
    groups: list[dict] = []

    for index, scene in enumerate(scenes):
        raw_turns = scene.get("turns", [])
        turns = []
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
                    "action": turn.get("action", "speak"),
                    "target": _to_key(raw_target) if raw_target else None,
                }
            )

        # Cast = the beat cast, in first-appearance order, deduped.
        cast_keys: list[str] = []
        seen: set[str] = set()
        for raw in list(scene.get("cast", [])) + [t["speaker"] for t in turns]:
            key = _to_key(raw)
            if key not in seen:
                seen.add(key)
                cast_keys.append(key)

        mood = (mood_overrides or {}).get(index) or _mood_for(turns)
        anchor = (anchors or {}).get(index) or _anchor_for(index, total)
        location = (location_overrides or {}).get(index)

        group = {
            "id": f"scene-{index}",
            "label": _short_label(scene.get("setting", ""), index),
            "mood": mood,
            "anchor": anchor,
            "cast": [_cast_entry(k) for k in cast_keys],
            "turns": turns,
        }
        if location:
            group["locationId"] = location
        groups.append(group)

    return {
        "version": ENSEMBLE_VERSION,
        "title": chronicle.get("title", ""),
        "groups": groups,
    }


def write_ensemble(
    chronicle: dict,
    *,
    root: Path | None = None,
    name: str | None = None,
) -> Path:
    """Write the ensemble contract JSON for a chronicle; return the path."""
    ensemble = to_ensemble(chronicle)
    out_dir = root or _ENSEMBLE_ROOT
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = name or chronicle.get("episode") or "ensemble"
    path = out_dir / f"{stem}.json"
    path.write_text(json.dumps(ensemble, indent=2, ensure_ascii=False))
    return path
