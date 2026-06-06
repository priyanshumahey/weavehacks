"""The ``Lord`` — a standalone, in-character agent (L2).

Step-0 surface: ``Lord.load(key, at_time=...)`` to hydrate, and ``chat`` to hold
a traced, memory-grounded conversation. No orchestrator, scene, or world loop is
involved — the same object will later gain ``act``/``appraise``/``reflect``.
"""

from __future__ import annotations

import time
import uuid

import weave

from got_agents.agent import prompts
from got_agents.agent.genome import Genome
from got_agents.cognition.memory import MemoryStore
from got_agents.cognition.types import Memory
from got_agents.infra import llm


class Lord:
    def __init__(
        self,
        genome: Genome,
        memory: MemoryStore,
        *,
        at_time: str | None = None,
    ) -> None:
        self.genome = genome
        self.memory = memory
        self.at_time = at_time
        self.identity = genome.identity()
        self.drives = genome.drives()

    @classmethod
    def load(cls, key: str, at_time: str | None = None) -> Lord:
        """Hydrate a Lord, seeding its memory stream on first load."""
        from got_agents.characters import get_character

        spec = get_character(key)
        memory = MemoryStore(spec.genome.key)
        memory.ensure()
        if memory.is_empty():
            for seed in spec.seed_memories:
                memory.encode(seed)
        return cls(spec.genome, memory, at_time=at_time)

    @weave.op
    def recall(self, cue: str, k: int = 5) -> list[Memory]:
        return self.memory.retrieve(cue, k, concepts=self.identity.fixed_bag)

    @weave.op
    def chat(self, message: str) -> str:
        """One in-character, memory-grounded reply (the Step-0 done-criterion)."""
        memories = self.recall(message)
        messages = prompts.chat_messages(
            self.identity, self.drives, memories, message
        )
        reply = llm.complete(messages)
        self._remember_exchange(message, reply)
        return reply

    def _remember_exchange(self, message: str, reply: str) -> None:
        self.memory.encode(
            Memory(
                id=f"chat:{uuid.uuid4().hex}",
                text=f'When asked "{message}", I answered: {reply}',
                importance=0.3,
                timestamp=time.time(),
                concepts=("conversation",),
            )
        )
