"""Thin OpenAI wrapper — the single place model names and calls live.

GPT-5.5 is the locked cognition/judging model (Scope & Simplifications). Calls
are auto-traced by Weave once :func:`got_agents.infra.weave_setup.init_weave`
has run, so these helpers stay deliberately minimal.
"""

from __future__ import annotations

from functools import lru_cache

from openai import OpenAI

from got_agents.config import settings

CHAT_MODEL = "gpt-5.5"
EMBED_MODEL = "text-embedding-3-small"

Message = dict[str, str]


@lru_cache(maxsize=1)
def client() -> OpenAI:
    return OpenAI(api_key=settings.openai_api_key)


def complete(messages: list[Message], model: str = CHAT_MODEL) -> str:
    """Return the assistant text for a chat completion."""
    response = client().chat.completions.create(model=model, messages=messages)
    return response.choices[0].message.content or ""


def embed(text: str, model: str = EMBED_MODEL) -> list[float]:
    """Return the embedding vector for a single string."""
    response = client().embeddings.create(model=model, input=text)
    return response.data[0].embedding
