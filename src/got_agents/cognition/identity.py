"""Identity — the self-story and voice that make a Lord *this* character.

A pure L1 value object (no genome/world imports). The ``agent`` layer builds one
from a genome and hands it to prompt assembly.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class Identity:
    """Who a character believes they are, and how they sound."""

    name: str
    self_persona: str
    life_motive: str
    voice_anchors: tuple[str, ...] = ()
    fixed_bag: tuple[str, ...] = ()
    # Evolved guidance (Part C). Authored gen-0 leaves these empty; the training
    # loop fills them: behavioral rules and few-shot exemplar lines.
    reflection_rules: tuple[str, ...] = ()
    canon_exemplars: tuple[str, ...] = ()
