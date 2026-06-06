"""The drive system — constant action pressure expressed as a felt desire.

Eight political drives (AGENT_SYSTEM_DESIGN.md A.5). For the Step-0 chat slice
this is **read-only**: a static drive vector renders to a first-person desire
string. The satisfaction/decay loop (appraisal writing drive deltas) arrives
with the cognitive tick in a later step.
"""

from __future__ import annotations

from dataclasses import dataclass

DRIVES = (
    "survival",
    "power",
    "legitimacy",
    "loyalty",
    "honor",
    "vengeance",
    "wealth",
    "information",
)

_PHRASING = {
    "survival": "stay alive; the wrong move means death",
    "power": "tighten my grip on power",
    "legitimacy": "have my right to rule unquestioned",
    "loyalty": "bind the few I can trust closer",
    "honor": "be seen to keep my word",
    "vengeance": "make those who wronged me pay",
    "wealth": "secure the gold that buys everything",
    "information": "know what others would keep hidden",
}


@dataclass(frozen=True, slots=True)
class Drives:
    """A drive vector (each value in ``[0, 100]``)."""

    values: dict[str, float]

    def top(self, n: int = 3) -> list[tuple[str, float]]:
        return sorted(self.values.items(), key=lambda kv: kv[1], reverse=True)[:n]

    def felt(self, n: int = 3) -> str:
        """A first-person sentence of the strongest desires (the D2A bridge)."""
        wants = [_PHRASING.get(name, name) for name, _ in self.top(n)]
        if not wants:
            return ""
        return "Right now I want to " + "; ".join(wants) + "."
