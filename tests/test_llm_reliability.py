"""Reliability tests for the agent acting loop's LLM layer.

The acting loop (plan_phase -> council act -> appraise -> reflect) makes many LLM
calls per episode. A single transient failure must not abort a long run, but a
permanent error (auth, bad request) must surface immediately. These exercise the
retry wrapper in isolation (no network).
"""

from __future__ import annotations

import httpx
import pytest
from openai import AuthenticationError, RateLimitError

import got_agents.infra.llm as llm


def _rate_limit() -> RateLimitError:
    resp = httpx.Response(429, request=httpx.Request("POST", "http://x"))
    return RateLimitError("rate limited", response=resp, body=None)


def _auth_error() -> AuthenticationError:
    resp = httpx.Response(401, request=httpx.Request("POST", "http://x"))
    return AuthenticationError("bad key", response=resp, body=None)


@pytest.fixture(autouse=True)
def _fast_backoff(monkeypatch):
    # Keep the tests instant.
    monkeypatch.setattr(llm, "_BASE_DELAY_S", 0.001)
    monkeypatch.setattr(llm, "_MAX_DELAY_S", 0.002)


def test_retry_recovers_from_transient_errors() -> None:
    calls = {"n": 0}

    def flaky() -> str:
        calls["n"] += 1
        if calls["n"] < 3:
            raise _rate_limit()
        return "ok"

    assert llm._with_retry("t", flaky) == "ok"
    assert calls["n"] == 3


def test_retry_gives_up_after_max_attempts() -> None:
    calls = {"n": 0}

    def always_fails() -> str:
        calls["n"] += 1
        raise _rate_limit()

    with pytest.raises(RateLimitError):
        llm._with_retry("t", always_fails)
    assert calls["n"] == llm._MAX_ATTEMPTS


def test_permanent_error_is_not_retried() -> None:
    calls = {"n": 0}

    def perm() -> str:
        calls["n"] += 1
        raise _auth_error()

    with pytest.raises(AuthenticationError):
        llm._with_retry("t", perm)
    assert calls["n"] == 1
