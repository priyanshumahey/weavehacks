"""L0 infrastructure: Weave, the LLM client, and Redis access.

Lowest layer of the Reuse Contract (see AGENT_SYSTEM_DESIGN.md PART G) — depends
on nothing in the project except :mod:`got_agents.config`.
"""

from got_agents.infra import llm
from got_agents.infra.weave_setup import init_weave

__all__ = ["init_weave", "llm"]
