"""The genome — a character's authored, (eventually) evolvable configuration.

For Step 0 this is the era-agnostic core only (persona, voice, Fixed Bag, drive
params). The evolved fields (reflection rules/memory, generation lineage) join
later with the training loop. The genome is data; it builds the L1 value objects
a Lord needs.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from got_agents.cognition.drives import Drives
from got_agents.cognition.identity import Identity


@dataclass(frozen=True, slots=True)
class Genome:
    key: str
    name: str
    title: str
    self_persona: str
    life_motive: str
    voice_anchors: tuple[str, ...] = ()
    fixed_bag: tuple[str, ...] = ()
    drive_params: dict[str, float] = field(default_factory=dict)
    generation: int = 0

    def identity(self) -> Identity:
        return Identity(
            name=self.name,
            self_persona=self.self_persona,
            life_motive=self.life_motive,
            voice_anchors=self.voice_anchors,
            fixed_bag=self.fixed_bag,
        )

    def drives(self) -> Drives:
        return Drives(values=dict(self.drive_params))
