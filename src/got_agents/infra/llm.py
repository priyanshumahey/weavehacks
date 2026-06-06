from __future__ import annotations

import json
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
    response = client().chat.completions.create(model=model, messages=messages)
    return response.choices[0].message.content or ""


def complete_json(messages: list[Message], model: str = CHAT_MODEL) -> dict:
    response = client().chat.completions.create(
        model=model,
        messages=messages,
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def embed(text: str, model: str = EMBED_MODEL) -> list[float]:
    response = client().embeddings.create(model=model, input=text)
    return response.data[0].embedding
