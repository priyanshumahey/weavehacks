"""World types (L4) — the canon event ledger and the folded world snapshot.

The ledger is an ordered, append-only list of derived canon facts (no
copyrighted text). ``fold(ledger, T)`` (see ``world/fold.py``) replays every
event up to a story point T into a :class:`WorldSnapshot`: who is dead, who
holds which title, the oath/alliance/marriage record, and the **secrets
registry** (who-knows-what) — the entire information-asymmetry substrate.

Schema mirrors AGENT_SYSTEM_DESIGN.md (Canon Timeline:
``{id, time, order, type, participants, effects, visibility, known_to}``).
Everything here is JSON-serializable so the Step-2 extraction pipeline can write
ledgers to disk and ``fold`` stays a pure function over plain data.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from got_agents.cognition import canon_time

# Effect operations a ledger event may apply to world state. Kept as a small,
# closed vocabulary so `fold` is a total function (unknown ops are ignored).
EFFECT_OPS: tuple[str, ...] = (
    "kill",  # {op, who}
    "title",  # {op, who, title}
    "oath",  # {op, by, to, terms}
    "ally",  # {op, who: [a, b, ...]}
    "marry",  # {op, who: [a, b]}
    "secret",  # {op, secret, fact, known_to: [...]}
    "learn",  # {op, secret, who}
)


@dataclass(frozen=True, slots=True)
class LedgerEvent:
    """One ordered canon event."""

    id: str
    point: str  # canon story point, e.g. "s1e1"
    type: str
    summary: str  # short derived fact (no copyrighted text)
    participants: tuple[str, ...] = ()
    effects: tuple[dict, ...] = ()
    visibility: str = "public"  # "public" | "secret"
    known_to: tuple[str, ...] = ()
    order: int = 0  # intra-episode tiebreak

    @property
    def sort_key(self) -> tuple[int, int]:
        return (canon_time.code(self.point), self.order)

    @classmethod
    def from_dict(cls, raw: dict) -> LedgerEvent:
        return cls(
            id=str(raw["id"]),
            point=str(raw.get("point") or raw.get("time")),
            type=str(raw.get("type") or "event"),
            summary=str(raw.get("summary") or ""),
            participants=tuple(str(p) for p in raw.get("participants") or ()),
            effects=tuple(dict(e) for e in raw.get("effects") or ()),
            visibility=str(raw.get("visibility") or "public"),
            known_to=tuple(str(k) for k in raw.get("known_to") or ()),
            order=int(raw.get("order") or 0),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "point": self.point,
            "type": self.type,
            "summary": self.summary,
            "participants": list(self.participants),
            "effects": [dict(e) for e in self.effects],
            "visibility": self.visibility,
            "known_to": list(self.known_to),
            "order": self.order,
        }


@dataclass(frozen=True, slots=True)
class Secret:
    """A registered secret and the exact set entitled to know it."""

    id: str
    fact: str
    known_to: frozenset[str] = frozenset()


@dataclass(frozen=True, slots=True)
class Oath:
    by: str
    to: str
    terms: str


@dataclass(slots=True)
class WorldSnapshot:
    """The world derived at one story point T."""

    point: str
    dead: set[str] = field(default_factory=set)
    titles: dict[str, str] = field(default_factory=dict)
    oaths: list[Oath] = field(default_factory=list)
    alliances: list[frozenset[str]] = field(default_factory=list)
    marriages: list[frozenset[str]] = field(default_factory=list)
    secrets: dict[str, Secret] = field(default_factory=dict)

    def is_alive(self, who: str) -> bool:
        return who not in self.dead

    def knows(self, who: str, secret_id: str) -> bool:
        secret = self.secrets.get(secret_id)
        return bool(secret and who in secret.known_to)

    def secrets_known_to(self, who: str) -> tuple[Secret, ...]:
        return tuple(s for s in self.secrets.values() if who in s.known_to)

    def apply(self, effect: dict) -> None:
        """Mutate the snapshot by one effect (the closed EFFECT_OPS vocabulary).

        The single place world state changes — shared by ``fold`` (replaying the
        canon ledger) and live action ``resolution`` (a Lord's decision in a
        scene). Unknown ops are ignored so this stays a total function.
        """
        op = str(effect.get("op") or "")
        if op == "kill":
            if who := effect.get("who"):
                self.dead.add(str(who))
        elif op == "title":
            who, title = effect.get("who"), effect.get("title")
            if who and title:
                self.titles[str(who)] = str(title)
        elif op == "oath":
            by, to = effect.get("by"), effect.get("to")
            if by and to:
                self.oaths.append(
                    Oath(by=str(by), to=str(to), terms=str(effect.get("terms") or ""))
                )
        elif op == "ally":
            members = _members(effect)
            if len(members) >= 2:
                self.alliances.append(members)
        elif op == "marry":
            members = _members(effect)
            if len(members) >= 2:
                self.marriages.append(members)
        elif op == "secret":
            sid = effect.get("secret")
            if sid:
                sid = str(sid)
                known = frozenset(str(k) for k in effect.get("known_to") or ())
                self.secrets[sid] = Secret(
                    id=sid, fact=str(effect.get("fact") or ""), known_to=known
                )
        elif op == "learn":
            sid, who = effect.get("secret"), effect.get("who")
            if sid and who:
                sid = str(sid)
                existing = self.secrets.get(sid)
                if existing is not None:
                    self.secrets[sid] = Secret(
                        id=existing.id,
                        fact=existing.fact,
                        known_to=existing.known_to | {str(who)},
                    )

    def apply_all(self, effects: object) -> None:
        for effect in effects or ():
            if isinstance(effect, dict):
                self.apply(effect)


def _members(effect: dict) -> frozenset[str]:
    raw = effect.get("who")
    if isinstance(raw, (list, tuple)):
        return frozenset(str(m) for m in raw)
    return frozenset()
