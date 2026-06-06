from __future__ import annotations

from got_agents.agent.types import ACTION_VOCAB, Perception
from got_agents.cognition.drives import Drives
from got_agents.cognition.identity import Identity
from got_agents.cognition.types import Memory
from got_agents.infra.llm import Message


def _persona_block(identity: Identity, drives: Drives, memories: list[Memory]) -> list[str]:
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
    return parts


def system_prompt(identity: Identity, drives: Drives, memories: list[Memory]) -> str:
    parts = _persona_block(identity, drives, memories)
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


def _scene_block(perception: Perception) -> str:
    present = ", ".join(perception.cast)
    lines = [
        f"The scene: {perception.setting}.",
        f"At stake: {perception.stakes}.",
        f"Present: {present}.",
    ]
    if perception.history:
        spoken = "\n".join(
            f"  - {line.speaker}: {line.dialogue}" for line in perception.history
        )
        lines.append("What has been said so far:\n" + spoken)
    else:
        lines.append("No one has spoken yet; the scene is yours to open.")
    return "\n".join(lines)


def act_system_prompt(
    identity: Identity,
    drives: Drives,
    memories: list[Memory],
    perception: Perception,
) -> str:
    parts = _persona_block(identity, drives, memories)
    parts.append(_scene_block(perception))
    vocab = ", ".join(ACTION_VOCAB)
    parts.append(
        "It is your turn. Decide your single next move. You wear a public face "
        "and may hold a private intent that contradicts it — scheme if it serves "
        "you. You may also stay silent by choosing \"pass\".\n"
        f"Choose one action from: {vocab}.\n"
        "Respond with a JSON object and nothing else, with these keys:\n"
        '  "action": one of the listed actions,\n'
        '  "target": the character you act toward, or null,\n'
        '  "public_stance": what the room sees and hears you intend,\n'
        '  "private_intent": your true aim (may differ from the public stance),\n'
        '  "dialogue": the exact line you speak aloud (empty string if you pass),\n'
        '  "thinking": one or two sentences of private inner voice.'
    )
    return "\n\n".join(parts)


def act_messages(
    identity: Identity,
    drives: Drives,
    memories: list[Memory],
    perception: Perception,
) -> list[Message]:
    return [
        {
            "role": "system",
            "content": act_system_prompt(identity, drives, memories, perception),
        },
        {"role": "user", "content": "What do you do?"},
    ]


def appraise_messages(
    identity: Identity,
    drives: Drives,
    transcript: str,
    own_intents: str,
) -> list[Message]:
    drive_names = ", ".join(drives.values)
    system = (
        f"You are {identity.name}, reflecting privately after a scene. Judge it "
        "by your own aims and nature — be honest with yourself.\n"
        f"The scene, as it played out publicly:\n{transcript}\n\n"
        f"What you were truly after:\n{own_intents}\n\n"
        "Respond with a JSON object and nothing else, with these keys:\n"
        '  "emotion": one word for how you feel now,\n'
        '  "drive_deltas": an object mapping any of '
        f"[{drive_names}] to an integer change in [-20, 20],\n"
        '  "memory": one first-person sentence worth remembering from this scene,\n'
        '  "concepts": up to three short concept tags for that memory.'
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "How do you take stock?"},
    ]
