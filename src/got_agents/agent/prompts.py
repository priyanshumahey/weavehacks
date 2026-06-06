"""Prompt assembly for a Lord (L2).

Lives in the agent layer because it weaves together the genome's identity, the
drive desire string, and retrieved memories — composing L1 pieces into the
messages sent to the model.
"""

from __future__ import annotations

from got_agents.cognition.drives import Drives
from got_agents.cognition.identity import Identity
from got_agents.cognition.types import Memory
from got_agents.infra.llm import Message


def system_prompt(identity: Identity, drives: Drives, memories: list[Memory]) -> str:
    parts = [
        f"You are {identity.name}. You speak and reason strictly in character, "
        "from a first-person point of view, never breaking character or "
        "referring to yourself as an AI.",
        f"Who you are: {identity.self_persona}",
        f"What drives you above all: {identity.life_motive}",
    ]
    if identity.voice_anchors:
        anchors = "\n".join(f'  - "{line}"' for line in identity.voice_anchors)
        parts.append("Your voice sounds like these lines:\n" + anchors)
    felt = drives.felt()
    if felt:
        parts.append(felt)
    if memories:
        recalled = "\n".join(f"  - {memory.text}" for memory in memories)
        parts.append(
            "Relevant things you remember (draw on these; do not recite them "
            "verbatim):\n" + recalled
        )
    parts.append(
        "Answer in two or three sentences, in your own voice. Reveal only what "
        "this character would choose to reveal."
    )
    return "\n\n".join(parts)


def chat_messages(
    identity: Identity,
    drives: Drives,
    memories: list[Memory],
    message: str,
) -> list[Message]:
    return [
        {"role": "system", "content": system_prompt(identity, drives, memories)},
        {"role": "user", "content": message},
    ]
