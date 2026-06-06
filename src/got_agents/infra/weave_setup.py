"""Weave initialization — call :func:`init_weave` once at process start.

After ``weave.init`` the OpenAI SDK is auto-patched, so raw model calls are
captured in the trace tree alongside anything decorated with ``@weave.op``.
"""

from __future__ import annotations

import weave

from got_agents.config import settings

_client: weave.trace.weave_client.WeaveClient | None = None


def init_weave() -> object:
    """Idempotently initialize Weave for the configured project.

    Falls back to the user's default entity (project basename) if the configured
    ``entity/project`` is inaccessible, so tracing never hard-blocks a run.
    """
    global _client
    if _client is None:
        try:
            _client = weave.init(settings.weave_project)
        except Exception:  # configured entity may be inaccessible to this key
            project = settings.weave_project.rsplit("/", 1)[-1]
            _client = weave.init(project)
    return _client
