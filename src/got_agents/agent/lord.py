from __future__ import annotations

import time
import uuid

import weave

from got_agents.agent import prompts
from got_agents.agent.genome import Genome
from got_agents.agent.types import ACTION_VOCAB, Appraisal, Decision, Perception, Reflection
from got_agents.cognition import canon_time
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
        self.as_of = canon_time.to_timestamp(at_time) if at_time else None
        self.identity = genome.identity()
        self.drives = genome.drives()

    @classmethod
    def load(cls, key: str, at_time: str | None = None) -> Lord:
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
        return self.memory.retrieve(
            cue,
            k,
            concepts=self.identity.fixed_bag,
            now=self.as_of,
            as_of=self.as_of,
        )

    @weave.op
    def chat(self, message: str) -> str:
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

    @weave.op
    def act(self, perception: Perception) -> Decision:
        memories = self.recall(perception.cue())
        messages = prompts.act_messages(
            self.identity, self.drives, memories, perception
        )
        raw = llm.complete_json(messages)
        return self._parse_decision(raw)

    @staticmethod
    def _parse_decision(raw: dict) -> Decision:
        action = str(raw.get("action") or "speak")
        if action not in ACTION_VOCAB:
            action = "speak"
        target = raw.get("target")
        return Decision(
            action=action,
            target=str(target) if target else None,
            public_stance=str(raw.get("public_stance") or ""),
            private_intent=str(raw.get("private_intent") or ""),
            dialogue=str(raw.get("dialogue") or ""),
            thinking=str(raw.get("thinking") or ""),
        )

    @weave.op
    def appraise(self, transcript: str, own_intents: str) -> Appraisal:
        messages = prompts.appraise_messages(
            self.identity, self.drives, transcript, own_intents
        )
        raw = llm.complete_json(messages)
        appraisal = self._parse_appraisal(raw)
        if appraisal.drive_deltas:
            self.drives = self.drives.adjust(appraisal.drive_deltas)
        if appraisal.memory:
            self.memory.encode(
                Memory(
                    id=f"scene:{uuid.uuid4().hex}",
                    text=appraisal.memory,
                    importance=0.55,
                    timestamp=time.time(),
                    concepts=appraisal.concepts,
                )
            )
        return appraisal

    @staticmethod
    def _parse_appraisal(raw: dict) -> Appraisal:
        deltas_raw = raw.get("drive_deltas") or {}
        deltas: dict[str, float] = {}
        if isinstance(deltas_raw, dict):
            for name, value in deltas_raw.items():
                try:
                    deltas[str(name)] = float(value)
                except (TypeError, ValueError):
                    continue
        concepts_raw = raw.get("concepts") or ()
        concepts = tuple(
            str(c) for c in concepts_raw if isinstance(concepts_raw, (list, tuple))
        )
        return Appraisal(
            emotion=str(raw.get("emotion") or ""),
            drive_deltas=deltas,
            memory=str(raw.get("memory") or ""),
            concepts=concepts,
        )

    @weave.op
    def reflect(self, trigger: str, episode_digest: str) -> Reflection:
        """A.3 step 9 — consolidate an episode into durable self-knowledge.

        Encodes the consolidated summary as a high-importance memory so it
        surfaces in later recall; the episode's many scene memories thus compress
        into one identity-level takeaway.
        """
        messages = prompts.reflect_messages(
            self.identity, self.drives, trigger, episode_digest
        )
        raw = llm.complete_json(messages)
        reflection = self._parse_reflection(raw)
        if reflection.summary:
            self.memory.encode(
                Memory(
                    id=f"reflect:{uuid.uuid4().hex}",
                    text=reflection.summary,
                    importance=0.85,
                    timestamp=time.time(),
                    concepts=reflection.concepts or ("reflection",),
                )
            )
        return reflection

    @staticmethod
    def _parse_reflection(raw: dict) -> Reflection:
        rules_raw = raw.get("rules") or ()
        rules = tuple(
            str(r) for r in rules_raw if isinstance(rules_raw, (list, tuple)) and r
        )
        rel_raw = raw.get("relationships") or {}
        relationships: dict[str, str] = {}
        if isinstance(rel_raw, dict):
            for name, note in rel_raw.items():
                relationships[str(name)] = str(note)
        concepts_raw = raw.get("concepts") or ()
        concepts = tuple(
            str(c) for c in concepts_raw if isinstance(concepts_raw, (list, tuple))
        )
        return Reflection(
            summary=str(raw.get("summary") or ""),
            rules=rules,
            relationships=relationships,
            concepts=concepts,
        )
