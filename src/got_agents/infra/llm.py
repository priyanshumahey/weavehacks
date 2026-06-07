from __future__ import annotations

import json
import logging
import random
import time
from functools import lru_cache
from typing import Callable, TypeVar

from openai import (
    APIConnectionError,
    APITimeoutError,
    AzureOpenAI,
    InternalServerError,
    OpenAI,
    RateLimitError,
)

from got_agents.config import settings

CHAT_MODEL = "gpt-5.5"
EMBED_MODEL = "text-embedding-3-small"

Message = dict[str, str]

_log = logging.getLogger("got_agents.llm")

# Transient failures worth retrying with backoff (rate limits, timeouts, dropped
# connections, 5xx). Permanent errors (auth, bad request, content filter) are NOT
# retried — they would only waste time and money.
_RETRYABLE = (RateLimitError, APITimeoutError, APIConnectionError, InternalServerError)
_MAX_ATTEMPTS = 5
_BASE_DELAY_S = 1.5
_MAX_DELAY_S = 30.0

T = TypeVar("T")


def _with_retry(label: str, call: Callable[[], T]) -> T:
    """Run ``call``; on a transient error, retry with exponential backoff +
    jitter. Re-raises the last error after ``_MAX_ATTEMPTS`` so a genuinely
    broken provider still surfaces, but a flaky one no longer kills a long run."""
    last_exc: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            return call()
        except _RETRYABLE as exc:  # type: ignore[misc]
            last_exc = exc
            if attempt == _MAX_ATTEMPTS:
                break
            delay = min(_MAX_DELAY_S, _BASE_DELAY_S * (2 ** (attempt - 1)))
            delay += random.uniform(0, delay * 0.25)  # jitter
            _log.warning(
                "llm %s transient error (attempt %d/%d): %s — retrying in %.1fs",
                label, attempt, _MAX_ATTEMPTS, type(exc).__name__, delay,
            )
            time.sleep(delay)
    assert last_exc is not None
    raise last_exc


def _is_azure() -> bool:
    return settings.llm_provider == "azure"


@lru_cache(maxsize=1)
def client() -> OpenAI | AzureOpenAI:
    """The provider client. Azure when LLM_PROVIDER=azure, else OpenAI.

    Switching is a single env var (LLM_PROVIDER); the rest of the codebase calls
    ``complete`` / ``complete_json`` / ``embed`` and never sees the difference.
    """
    if _is_azure():
        if not settings.azure_openai_endpoint:
            raise RuntimeError(
                "LLM_PROVIDER=azure but AZURE_OPENAI_ENDPOINT is not set"
            )
        return AzureOpenAI(
            api_key=settings.azure_openai_api_key,
            azure_endpoint=settings.azure_openai_endpoint,
            api_version=settings.azure_openai_api_version,
        )
    return OpenAI(api_key=settings.openai_api_key)


def _chat_model(model: str) -> str:
    """Resolve the chat model/deployment for the active provider.

    On Azure the ``model`` argument is the *deployment* name; map the default
    chat model to the configured deployment so callers stay provider-agnostic.
    """
    if _is_azure():
        return settings.azure_openai_chat_deployment if model == CHAT_MODEL else model
    return model


def _embed_model(model: str) -> str:
    if _is_azure():
        return settings.azure_openai_embed_deployment if model == EMBED_MODEL else model
    return model


def complete(messages: list[Message], model: str = CHAT_MODEL) -> str:
    response = _with_retry(
        "complete",
        lambda: client().chat.completions.create(
            model=_chat_model(model), messages=messages
        ),
    )
    return response.choices[0].message.content or ""


def complete_json(messages: list[Message], model: str = CHAT_MODEL) -> dict:
    response = _with_retry(
        "complete_json",
        lambda: client().chat.completions.create(
            model=_chat_model(model),
            messages=messages,
            response_format={"type": "json_object"},
        ),
    )
    content = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def embed(text: str, model: str = EMBED_MODEL) -> list[float]:
    response = _with_retry(
        "embed",
        lambda: client().embeddings.create(model=_embed_model(model), input=text),
    )
    return response.data[0].embedding
