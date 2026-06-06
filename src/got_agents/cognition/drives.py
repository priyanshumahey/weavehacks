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
    values: dict[str, float]

    def top(self, n: int = 3) -> list[tuple[str, float]]:
        return sorted(self.values.items(), key=lambda kv: kv[1], reverse=True)[:n]

    def felt(self, n: int = 3) -> str:
        wants = [_PHRASING.get(name, name) for name, _ in self.top(n)]
        if not wants:
            return ""
        return "Right now I want to " + "; ".join(wants) + "."

    def adjust(self, deltas: dict[str, float]) -> Drives:
        updated = dict(self.values)
        for name, delta in deltas.items():
            if name in updated:
                updated[name] = max(0.0, min(100.0, updated[name] + float(delta)))
        return Drives(values=updated)
