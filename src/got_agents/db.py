"""Postgres access."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg

from got_agents.config import settings


@contextmanager
def connection() -> Iterator[psycopg.Connection]:
    conn = psycopg.connect(settings.database_url)
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def ping() -> bool:
    with connection() as conn:
        return conn.execute("SELECT 1").fetchone() == (1,)
