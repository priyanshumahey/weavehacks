"""Connectivity checks for the data stack (Redis + Postgres)."""

from __future__ import annotations

import pytest
import redis

from got_agents import db, settings


def test_redis_ping() -> None:
    client = redis.from_url(settings.redis_url)
    try:
        assert client.ping()
    except redis.exceptions.ConnectionError:
        pytest.skip("Redis not running — ./scripts/stack.sh up")


def test_postgres_ping() -> None:
    try:
        assert db.ping()
    except Exception:
        pytest.skip("Postgres not running — ./scripts/stack.sh up")
