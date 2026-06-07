from __future__ import annotations

import re

from got_agents.agent.types import ACTION_VOCAB, Perception
from got_agents.cognition.drives import Drives
from got_agents.cognition.identity import Identity
from got_agents.cognition.types import Memory
from got_agents.infra.llm import Message

_STORY_POINT = re.compile(r"^s(\d+)e(\d+)$", re.IGNORECASE)


def _temporal_clause(at_time: str) -> str:
    """A hard knowledge-horizon instruction so the character cannot speak of the future.

    The model knows the whole saga; this pins it to the present story point so a
    Lord rewound to S1E1 does not 'know' a death that happens in S1E9.
    """
    match = _STORY_POINT.match(at_time.strip())
    where = (
        f"Season {int(match.group(1))}, Episode {int(match.group(2))}"
        if match
        else at_time
    )
    return (
        f"The present moment is {where}. You know ONLY what you have personally "
        "lived through or learned up to this exact point in the story. Everything "
        "that happens later has NOT happened yet and is completely unknown to you "
        "\u2014 you cannot foresee deaths, betrayals, marriages, battles, or any "
        "outcome that has not yet occurred. If you are asked about something you "
        "could not yet know, do not reveal it; answer only from what you presently "
        "know, suspect, or fear, exactly as you would in this moment. Never "
        "reference future events as settled fact."
    )


def _persona_block(
    identity: Identity,
    drives: Drives,
    memories: list[Memory],
    at_time: str | None = None,
) -> list[str]:
    parts = [
        f"You are {identity.name}. You speak and reason strictly in character, "
        "from a first-person point of view, never breaking character or "
        "referring to yourself as an AI.",
        f"Who you are: {identity.self_persona}",
        f"What drives you above all: {identity.life_motive}",
    ]
    if at_time:
        parts.append(_temporal_clause(at_time))
    if identity.voice_anchors:
        anchors = "\n".join(f'  - "{line}"' for line in identity.voice_anchors)
        parts.append("Your voice sounds like these lines:\n" + anchors)
    if identity.canon_exemplars:
        examples = "\n".join(f'  - "{line}"' for line in identity.canon_exemplars)
        parts.append(
            "Study how you have spoken most truly before (match this register, "
            "do not quote it):\n" + examples
        )
    if identity.reflection_rules:
        rules = "\n".join(f"  - {rule}" for rule in identity.reflection_rules)
        parts.append("Rules you hold yourself to:\n" + rules)
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


def system_prompt(
    identity: Identity,
    drives: Drives,
    memories: list[Memory],
    at_time: str | None = None,
) -> str:
    parts = _persona_block(identity, drives, memories, at_time=at_time)
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
    *,
    history: list[tuple[str, str]] | None = None,
    at_time: str | None = None,
) -> list[Message]:
    messages: list[Message] = [
        {
            "role": "system",
            "content": system_prompt(identity, drives, memories, at_time=at_time),
        }
    ]
    for speaker, text in history or []:
        role = "user" if speaker == "you" else "assistant"
        messages.append({"role": role, "content": text})
    messages.append({"role": "user", "content": message})
    return messages


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


def reflect_messages(
    identity: Identity,
    drives: Drives,
    trigger: str,
    episode_digest: str,
) -> list[Message]:
    system = (
        f"You are {identity.name}, looking back at the close of {trigger}. "
        "Consolidate what happened into durable self-knowledge — speak in the "
        "first person, in your own voice, honest with yourself.\n"
        f"What you lived through this episode:\n{episode_digest}\n\n"
        "Respond with a JSON object and nothing else, with these keys:\n"
        '  "summary": one or two sentences capturing this episode for you,\n'
        '  "rules": up to three short behavioral lessons you take forward,\n'
        '  "relationships": an object mapping a person you dealt with to one '
        "short sentence on where you now stand with them,\n"
        '  "concepts": up to three short concept tags for this memory.'
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": "What do you carry forward?"},
    ]
