"""CharacterModel — a versioned ``weave.Model`` that wraps one genome (PART C.2).

``respond(cue)`` produces a single in-voice line from the genome alone — no
Redis memory — so the evaluation isolates the **genome** as the variable under
test (persona + evolved rules + exemplars + drives). Because it is a
``weave.Model``, every genome version is hashed and comparable across
generations, which is what makes the gen-0 -> gen-1 leaderboard climb real.
"""

from __future__ import annotations

import weave

from got_agents.agent.genome import Genome
from got_agents.agent import prompts
from got_agents.infra import llm


class CharacterModel(weave.Model):
    # Stored on the model so Weave versions the full genome with each variant.
    genome_dict: dict

    @classmethod
    def from_genome(cls, genome: Genome) -> "CharacterModel":
        from got_agents.training.genome_io import to_dict

        return cls(genome_dict=to_dict(genome))

    def genome(self) -> Genome:
        from got_agents.training.genome_io import from_dict

        return from_dict(self.genome_dict)

    @weave.op
    def predict(self, cue: str) -> str:
        genome = self.genome()
        identity = genome.identity()
        drives = genome.drives()
        system = prompts.system_prompt(identity, drives, memories=[])
        messages = [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    f"{cue}\n\nSpeak now, in one or two sentences, entirely in "
                    "character. Give only the spoken words themselves — no "
                    "quotation marks, no narration, no stage directions."
                ),
            },
        ]
        return _strip_quotes(llm.complete(messages).strip())

    @weave.op
    def react(self, scene: str) -> str:
        """Respond in character to a scene's preceding dialogue (reaction eval)."""
        genome = self.genome()
        system = prompts.system_prompt(genome.identity(), genome.drives(), memories=[])
        messages = [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": (
                    "You are in this scene. The dialogue so far:\n\n"
                    f"{scene}\n\n"
                    "It is your turn to speak. Reply as your character would in "
                    "this exact moment, in one or two sentences. Give only the "
                    "spoken words — no quotation marks, no narration."
                ),
            },
        ]
        return _strip_quotes(llm.complete(messages).strip())


_WRAPPING_QUOTES = ('"', "'", "“", "”", "‘", "’", "«", "»")


def _strip_quotes(text: str) -> str:
    """Remove wrapping quotation marks the model sometimes adds around a line."""
    cleaned = text.strip()
    # Strip a matched pair of leading/trailing quotes, repeatedly.
    changed = True
    while changed and len(cleaned) >= 2:
        changed = False
        if cleaned[0] in _WRAPPING_QUOTES and cleaned[-1] in _WRAPPING_QUOTES:
            cleaned = cleaned[1:-1].strip()
            changed = True
    return cleaned
