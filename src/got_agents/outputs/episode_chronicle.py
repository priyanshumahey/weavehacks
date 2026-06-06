"""Episode chronicle (L5) — serialize a run episode to a durable artifact.

Turns an :class:`EpisodeResult` (Director output) into a complete, replayable
record on disk: ``logs/episodes/<stamp>-<episode>.{json,txt}``. The JSON is the
canonical chronicle (the Weave dataset / replay source); the text is a
human-readable transcript. Offline artifact — nothing watches it live (§0 #6).
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from got_agents.orchestration.types import EpisodeResult
from got_agents.world.types import WorldSnapshot

_LOG_ROOT = Path("logs") / "episodes"


def _world_to_dict(world: WorldSnapshot | None) -> dict:
    if world is None:
        return {}
    return {
        "point": world.point,
        "dead": sorted(world.dead),
        "titles": dict(sorted(world.titles.items())),
        "oaths": [{"by": o.by, "to": o.to, "terms": o.terms} for o in world.oaths],
        "alliances": [sorted(a) for a in world.alliances],
        "marriages": [sorted(m) for m in world.marriages],
        "secrets": {
            sid: {"fact": s.fact, "known_to": sorted(s.known_to)}
            for sid, s in sorted(world.secrets.items())
        },
    }


def _reflection_to_dict(reflection: object) -> dict:
    return {
        "summary": getattr(reflection, "summary", ""),
        "rules": list(getattr(reflection, "rules", ()) or ()),
        "relationships": dict(getattr(reflection, "relationships", {}) or {}),
    }


def to_dict(result: EpisodeResult) -> dict:
    scenes = []
    for index, scene in enumerate(result.scenes):
        turns = []
        for turn in scene.transcript.turns:
            d = turn.decision
            turns.append(
                {
                    "round": turn.round,
                    "speaker": turn.speaker,
                    "action": d.action,
                    "target": d.target,
                    "dialogue": d.dialogue,
                    "public_stance": d.public_stance,
                    "private_intent": d.private_intent,
                    "thinking": d.thinking,
                }
            )
        scenes.append(
            {
                "index": index,
                "setting": scene.beat.setting,
                "stakes": scene.beat.stakes,
                "cast": list(scene.beat.cast),
                "turns": turns,
                "effects": [dict(e) for e in scene.effects],
            }
        )
    return {
        "episode": result.episode,
        "title": result.title,
        "scene_count": len(result.scenes),
        "scenes": scenes,
        "world_start": _world_to_dict(result.world_start),
        "world_end": _world_to_dict(result.world_end),
        "reflections": {
            name: _reflection_to_dict(r) for name, r in result.reflections.items()
        },
    }


def render_text(record: dict) -> str:
    lines = [
        "=" * 78,
        f"EPISODE {record['episode']}: {record['title']}",
        f"{record['scene_count']} scenes",
        "=" * 78,
        "",
    ]
    for scene in record["scenes"]:
        lines.append(f"— SCENE {scene['index'] + 1}: {scene['setting']}")
        lines.append(f"  stakes: {scene['stakes']}")
        lines.append(f"  cast:   {', '.join(scene['cast'])}")
        lines.append("-" * 78)
        for turn in scene["turns"]:
            spoken = turn["dialogue"].strip() or "…(silent)"
            tgt = f" -> {turn['target']}" if turn["target"] else ""
            lines.append(f"  [r{turn['round']}] {turn['speaker']} ({turn['action']}{tgt}):")
            lines.append(f"      says:    {spoken}")
            lines.append(f"      private: {turn['private_intent']}")
        if scene["effects"]:
            lines.append("  world changes:")
            for eff in scene["effects"]:
                lines.append(f"      + {eff}")
        lines.append("")

    if record["reflections"]:
        lines.append("=" * 78)
        lines.append("REFLECTIONS (what each carries forward)")
        lines.append("=" * 78)
        for name, r in record["reflections"].items():
            lines.append(f"  {name}: {r['summary']}")
            for rule in r["rules"]:
                lines.append(f"      rule: {rule}")
            for who, note in r["relationships"].items():
                lines.append(f"      on {who}: {note}")
        lines.append("")
    return "\n".join(lines)


def write_episode(result: EpisodeResult, *, root: Path | None = None) -> tuple[Path, Path]:
    """Persist an episode chronicle to disk; return ``(json_path, txt_path)``."""
    record = to_dict(result)
    out_dir = root or _LOG_ROOT
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    json_path = out_dir / f"{stamp}-{result.episode}.json"
    txt_path = out_dir / f"{stamp}-{result.episode}.txt"
    json_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    txt_path.write_text(render_text(record))
    return json_path, txt_path
