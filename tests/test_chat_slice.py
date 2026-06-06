"""Step-0 chatbot slice: a Lord recalls relevant memory and replies in character.

Skips when Redis or OpenAI are unavailable, matching ``test_infra.py``.
"""

from __future__ import annotations

import pytest
import redis

from got_agents import settings
from got_agents.agent import Lord
from got_agents.characters import get_character


def _require_infra() -> None:
    try:
        redis.from_url(settings.redis_url).ping()
    except redis.exceptions.ConnectionError:
        pytest.skip("Redis not running — ./scripts/stack.sh up")
    if not settings.openai_api_key:
        pytest.skip("OPENAI_API_KEY not set")


@pytest.fixture(scope="module")
def cersei() -> Lord:
    _require_infra()
    try:
        return Lord.load("cersei")
    except Exception as exc:  # network/auth issues -> skip, don't fail
        pytest.skip(f"could not load Lord (infra/LLM unavailable): {exc}")


def test_registry_has_cersei() -> None:
    spec = get_character("cersei")
    assert spec.genome.name == "Cersei Lannister"
    assert spec.seed_memories


def test_unknown_character_raises() -> None:
    with pytest.raises(KeyError):
        get_character("nobody")


def test_memory_seeded(cersei: Lord) -> None:
    assert cersei.memory.count() >= len(get_character("cersei").seed_memories)


def test_recall_is_relevant(cersei: Lord) -> None:
    memories = cersei.recall("Did you kill Robert?", k=3)
    assert memories
    blob = " ".join(m.text.lower() for m in memories)
    assert "robert" in blob or "jon arryn" in blob


def test_recall_grounds_in_canon_not_self_talk(cersei: Lord) -> None:
    # A prior conversation memory must not bury canon grounding (A.4 concept filter).
    cersei.chat("Did you kill Robert?")
    memories = cersei.recall("Did you kill Robert?", k=3)
    assert memories
    assert all("chat:" not in m.id for m in memories)


def test_chat_replies_in_character(cersei: Lord) -> None:
    reply = cersei.chat("Did you kill Robert?")
    assert isinstance(reply, str) and reply.strip()
