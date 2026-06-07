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
    # Evolvable fields (Part C). Empty in the authored gen-0 core; the training
    # loop grows them: behavioral rules mined by Reflexion/ExpeL and a few-shot
    # library of high-fidelity exemplar lines (PromptBreeder/Voyager).
    reflection_rules: tuple[str, ...] = ()
    canon_exemplars: tuple[str, ...] = ()

    def identity(self) -> Identity:
        return Identity(
            name=self.name,
            self_persona=self.self_persona,
            life_motive=self.life_motive,
            voice_anchors=self.voice_anchors,
            fixed_bag=self.fixed_bag,
            reflection_rules=self.reflection_rules,
            canon_exemplars=self.canon_exemplars,
        )

    def drives(self) -> Drives:
        return Drives(values=dict(self.drive_params))

    def evolved(
        self,
        *,
        self_persona: str | None = None,
        reflection_rules: tuple[str, ...] | None = None,
        canon_exemplars: tuple[str, ...] | None = None,
        drive_params: dict[str, float] | None = None,
        generation: int | None = None,
    ) -> Genome:
        """Return a new genome with the given evolvable fields replaced."""
        return Genome(
            key=self.key,
            name=self.name,
            title=self.title,
            self_persona=self_persona if self_persona is not None else self.self_persona,
            life_motive=self.life_motive,
            voice_anchors=self.voice_anchors,
            fixed_bag=self.fixed_bag,
            drive_params=dict(drive_params if drive_params is not None else self.drive_params),
            generation=generation if generation is not None else self.generation,
            reflection_rules=(
                reflection_rules if reflection_rules is not None else self.reflection_rules
            ),
            canon_exemplars=(
                canon_exemplars if canon_exemplars is not None else self.canon_exemplars
            ),
        )
