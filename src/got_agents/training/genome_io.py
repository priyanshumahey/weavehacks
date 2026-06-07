"""Genome serialization — persist a versioned genome per generation.

Each training generation writes its genome to
``logs/genomes/<key>/gen-<n>.json`` so a run is reproducible and the lineage is
inspectable. Pure data (no LLM); the evolved fields (``reflection_rules``,
``canon_exemplars``, mutated ``self_persona``/``drive_params``) are what change
between generations.
"""

from __future__ import annotations

import json
from pathlib import Path

from got_agents.agent.genome import Genome

_GENOME_ROOT = Path("logs") / "genomes"


def to_dict(genome: Genome) -> dict:
    return {
        "key": genome.key,
        "name": genome.name,
        "title": genome.title,
        "self_persona": genome.self_persona,
        "life_motive": genome.life_motive,
        "voice_anchors": list(genome.voice_anchors),
        "fixed_bag": list(genome.fixed_bag),
        "drive_params": dict(genome.drive_params),
        "generation": genome.generation,
        "reflection_rules": list(genome.reflection_rules),
        "canon_exemplars": list(genome.canon_exemplars),
    }


def from_dict(raw: dict) -> Genome:
    return Genome(
        key=str(raw["key"]),
        name=str(raw["name"]),
        title=str(raw.get("title") or ""),
        self_persona=str(raw.get("self_persona") or ""),
        life_motive=str(raw.get("life_motive") or ""),
        voice_anchors=tuple(raw.get("voice_anchors") or ()),
        fixed_bag=tuple(raw.get("fixed_bag") or ()),
        drive_params={k: float(v) for k, v in (raw.get("drive_params") or {}).items()},
        generation=int(raw.get("generation") or 0),
        reflection_rules=tuple(raw.get("reflection_rules") or ()),
        canon_exemplars=tuple(raw.get("canon_exemplars") or ()),
    )


def save_genome(genome: Genome, *, root: Path | None = None) -> Path:
    out_dir = (root or _GENOME_ROOT) / genome.key
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"gen-{genome.generation}.json"
    path.write_text(json.dumps(to_dict(genome), indent=2, ensure_ascii=False))
    return path


def load_genome(path: str | Path) -> Genome:
    return from_dict(json.loads(Path(path).read_text()))
