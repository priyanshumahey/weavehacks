"""L2 agent: the ``Lord`` and its genome.

Composes L1 cognition services and exposes a small, reusable surface
(``load``/``chat``). It does **not** import ``flows``/``world``/``orchestration``
— that is what keeps a ``Lord`` usable as a standalone chatbot (Reuse Contract).
"""

from got_agents.agent.genome import Genome
from got_agents.agent.lord import Lord

__all__ = ["Genome", "Lord"]
