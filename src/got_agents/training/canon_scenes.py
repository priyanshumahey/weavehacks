"""Canon-reaction probes — real scene context -> the character's actual line.

The strong held-out backtest (PART C.3, done properly). Instead of judging a
generated line against a few static voice quotes, we replay **real moments from
the show**: the conversation up to a point (the actual preceding lines, often
from other characters) becomes the context, and the character's *real next line*
is the gold answer. The agent is asked what it would say; we score how close it
comes to how the true character reacted.

This is character-specific (each probe is a real moment for that character),
reaction-specific (a response to a real situation), grounded in the script CSV,
and held-out by episode so training never sees the measured scenes.
"""

from __future__ import annotations

from dataclasses import dataclass

from got_agents.data_pipeline import sources

_CONTEXT_WINDOW = 4  # preceding lines shown as scene context
_MIN_GOLD_LEN = 25  # ignore trivial gold lines ("Yes.", stage directions)
_MAX_GOLD_LEN = 320


@dataclass(frozen=True, slots=True)
class ReactionProbe:
    character: str  # registry key OR csv speaker key
    point: str  # episode, e.g. "s1e8"
    context: tuple[tuple[str, str], ...]  # (speaker_name, line) before the gold
    gold_speaker: str  # the character's display name
    gold_line: str  # what they actually said

    def context_text(self) -> str:
        if not self.context:
            return "(the scene opens)"
        return "\n".join(f"{name}: {line}" for name, line in self.context)


def _display(csv_name: str) -> str:
    return csv_name.strip().title()


def scene_probes(
    speaker_csv_name: str,
    *,
    episodes: tuple[str, ...],
    character_key: str | None = None,
    max_probes: int = 8,
    context_window: int = _CONTEXT_WINDOW,
) -> list[ReactionProbe]:
    """Build reaction probes for ANY script speaker (no authored core required).

    ``speaker_csv_name`` is the lowercase name as it appears in the script CSV
    (e.g. ``"tyrion lannister"``). ``character_key`` labels the probe (defaults to
    the csv name) so the same scenes work for cored and core-less characters.
    """
    target = speaker_csv_name.strip().lower()
    key = character_key or target
    display = _display(target)
    probes: list[ReactionProbe] = []

    for point in episodes:
        lines = sources.lines_in_episode(point)  # ordered as in the script
        for i, ln in enumerate(lines):
            if ln.speaker != target:
                continue
            gold = ln.text.strip()
            if not (_MIN_GOLD_LEN <= len(gold) <= _MAX_GOLD_LEN):
                continue
            # Context = the preceding lines; require >=1 from someone else so the
            # probe is a genuine *reaction*, not a continuation of their own line.
            ctx: list[tuple[str, str]] = []
            j = i - 1
            while j >= 0 and len(ctx) < context_window:
                prev = lines[j]
                ctx.append((_display(prev.speaker), prev.text.strip()))
                j -= 1
            ctx.reverse()
            if not any(name.lower() != target for name, _ in ctx):
                continue
            probes.append(
                ReactionProbe(
                    character=key,
                    point=point,
                    context=tuple(ctx),
                    gold_speaker=display,
                    gold_line=gold,
                )
            )

    # Evenly sample across episodes rather than front-loading episode one.
    if len(probes) > max_probes:
        step = len(probes) / max_probes
        probes = [probes[int(k * step)] for k in range(max_probes)]
    return probes


def reaction_probes(
    character_key: str,
    *,
    episodes: tuple[str, ...],
    max_probes: int = 8,
    context_window: int = _CONTEXT_WINDOW,
) -> list[ReactionProbe]:
    """Reaction probes for an authored character (looks up its csv name)."""
    from got_agents.characters import get_character

    csv_name = get_character(character_key).genome.name.strip().lower()
    return scene_probes(
        csv_name,
        episodes=episodes,
        character_key=character_key,
        max_probes=max_probes,
        context_window=context_window,
    )

