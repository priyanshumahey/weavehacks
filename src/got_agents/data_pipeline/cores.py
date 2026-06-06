"""Character-core authoring (PART E.1) — lines -> an authored genome core.

One LLM pass turns a speaker's canonical lines into the era-agnostic genome core
(persona, voice anchors, Fixed Bag, drive params) plus a few seeded memories,
matching the shape of the hand-authored cores in ``characters/``. Cores are
written to ``data/cores/<key>.json`` and can be rebuilt idempotently.

Authoring is cheap **data work** (a handful of calls per character, run once),
not per-tick cognition — which is why breadth over the 565-speaker pool is
affordable (PART E cost note).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import weave

from got_agents.agent.genome import Genome
from got_agents.cognition import canon_time
from got_agents.cognition.drives import DRIVES
from got_agents.cognition.types import Memory
from got_agents.config import settings
from got_agents.data_pipeline import sources
from got_agents.infra import llm

_CORES_DIR = Path(settings.data_dir) / "cores"
_MAX_LINES = 60  # cap context handed to the authoring model


def slug(speaker: str) -> str:
    return speaker.strip().lower().replace(" ", "_")


@dataclass(frozen=True, slots=True)
class SeedMemory:
    text: str
    importance: float
    concepts: tuple[str, ...]
    point: str = "backstory"  # canon story point when learned

    def to_memory(self, key: str, index: int) -> Memory:
        ts = (
            canon_time.backstory_timestamp()
            if self.point == "backstory"
            else canon_time.to_timestamp(self.point)
        )
        return Memory(
            id=f"{key}:seed-{index}",
            text=self.text,
            importance=self.importance,
            timestamp=ts,
            concepts=self.concepts,
        )


@dataclass(frozen=True, slots=True)
class AuthoredCore:
    key: str
    tier: str
    genome: Genome
    seeds: tuple[SeedMemory, ...] = field(default_factory=tuple)

    def seed_memories(self) -> tuple[Memory, ...]:
        return tuple(s.to_memory(self.key, i) for i, s in enumerate(self.seeds))

    def to_dict(self) -> dict:
        g = self.genome
        return {
            "key": self.key,
            "tier": self.tier,
            "genome": {
                "name": g.name,
                "title": g.title,
                "self_persona": g.self_persona,
                "life_motive": g.life_motive,
                "voice_anchors": list(g.voice_anchors),
                "fixed_bag": list(g.fixed_bag),
                "drive_params": dict(g.drive_params),
                "generation": g.generation,
            },
            "seeds": [
                {
                    "text": s.text,
                    "importance": s.importance,
                    "concepts": list(s.concepts),
                    "point": s.point,
                }
                for s in self.seeds
            ],
        }

    @classmethod
    def from_dict(cls, raw: dict) -> AuthoredCore:
        g = raw["genome"]
        genome = Genome(
            key=raw["key"],
            name=str(g["name"]),
            title=str(g.get("title") or ""),
            self_persona=str(g.get("self_persona") or ""),
            life_motive=str(g.get("life_motive") or ""),
            voice_anchors=tuple(g.get("voice_anchors") or ()),
            fixed_bag=tuple(g.get("fixed_bag") or ()),
            drive_params={k: float(v) for k, v in (g.get("drive_params") or {}).items()},
            generation=int(g.get("generation") or 0),
        )
        seeds = tuple(
            SeedMemory(
                text=str(s["text"]),
                importance=float(s.get("importance") or 0.5),
                concepts=tuple(s.get("concepts") or ()),
                point=str(s.get("point") or "backstory"),
            )
            for s in raw.get("seeds") or ()
        )
        return cls(key=raw["key"], tier=str(raw.get("tier") or "full"),
                   genome=genome, seeds=seeds)


_SYSTEM = (
    "You are a character-bible author for a Game of Thrones political simulation. "
    "Given a character's real spoken lines, distil a compact, faithful core. "
    "Stay strictly grounded in the canon voice; invent nothing that contradicts it.\n"
    "Respond with a JSON object and nothing else, with these keys:\n"
    '  "name": the character\'s proper full name,\n'
    '  "title": their rank or station in one short phrase,\n'
    '  "self_persona": 2-3 sentences of how they see themselves,\n'
    '  "life_motive": one sentence — what drives them above all,\n'
    '  "voice_anchors": 3-5 SHORT verbatim lines chosen from the provided lines,\n'
    '  "fixed_bag": 8-12 lowercase one-word concept tags central to them,\n'
    f'  "drive_params": an object mapping EACH of [{", ".join(DRIVES)}] to an '
    "integer 0-100 (how strongly that political drive pulls them),\n"
    '  "seeds": 3-5 short DERIVED-FACT memories (no copyrighted text), each '
    '{"text": one first-person sentence, "importance": 0-1, "concepts": up to '
    '3 tags from the fixed_bag, "point": the canon story point like "s1e3" when '
    'they learned it, or "backstory" if it predates the series}.'
)


@weave.op
def author_core(speaker: str, *, up_to: str | None = None) -> AuthoredCore:
    """Author a full core for ``speaker`` from their lines (one LLM pass)."""
    lines = sources.lines_for_speaker(speaker, up_to=up_to)
    if not lines:
        raise ValueError(f"no script lines for {speaker!r}")
    sample = lines[:_MAX_LINES]
    rendered = "\n".join(f'  - "{ln.text}"' for ln in sample)
    messages = [
        {"role": "system", "content": _SYSTEM},
        {
            "role": "user",
            "content": (
                f"Character (as named in the script): {speaker}\n"
                f"Their lines:\n{rendered}"
            ),
        },
    ]
    raw = llm.complete_json(messages)
    return _parse(speaker, raw)


def _parse(speaker: str, raw: dict) -> AuthoredCore:
    key = slug(speaker)
    drive_params = {}
    for name in DRIVES:
        try:
            drive_params[name] = float((raw.get("drive_params") or {}).get(name, 50.0))
        except (TypeError, ValueError):
            drive_params[name] = 50.0
    genome = Genome(
        key=key,
        name=str(raw.get("name") or speaker.title()),
        title=str(raw.get("title") or ""),
        self_persona=str(raw.get("self_persona") or ""),
        life_motive=str(raw.get("life_motive") or ""),
        voice_anchors=tuple(str(v) for v in (raw.get("voice_anchors") or ())),
        fixed_bag=tuple(str(c).lower() for c in (raw.get("fixed_bag") or ())),
        drive_params=drive_params,
    )
    seeds = []
    for s in raw.get("seeds") or ():
        if not isinstance(s, dict) or not s.get("text"):
            continue
        try:
            importance = max(0.0, min(1.0, float(s.get("importance", 0.5))))
        except (TypeError, ValueError):
            importance = 0.5
        seeds.append(
            SeedMemory(
                text=str(s["text"]),
                importance=importance,
                concepts=tuple(str(c).lower() for c in (s.get("concepts") or ())),
                point=str(s.get("point") or "backstory"),
            )
        )
    return AuthoredCore(
        key=key, tier=sources.tier_of(speaker), genome=genome, seeds=tuple(seeds)
    )


def cores_dir() -> Path:
    return _CORES_DIR


def save_core(core: AuthoredCore) -> Path:
    _CORES_DIR.mkdir(parents=True, exist_ok=True)
    path = _CORES_DIR / f"{core.key}.json"
    path.write_text(json.dumps(core.to_dict(), indent=2))
    return path


def load_core(key: str) -> AuthoredCore:
    path = _CORES_DIR / f"{slug(key)}.json"
    return AuthoredCore.from_dict(json.loads(path.read_text()))


def core_exists(key: str) -> bool:
    return (_CORES_DIR / f"{slug(key)}.json").exists()
