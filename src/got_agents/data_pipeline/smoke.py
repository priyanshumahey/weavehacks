"""Per-episode smoke tests (PART E.3) — catch ledger drift before it compounds.

Scaling S1->S7 is incremental: extract an episode's ledger, **smoke-test it**,
only then move on. These checks are pure (no LLM, no Redis) and run on the
folded world so they're cheap to run after every episode.

Checks:
1. **folds clean** — every effect applies without error; the cumulative world at
   T is internally consistent (no one both alive and dead, etc.).
2. **secret-slug continuity** — every ``learn`` effect references a secret that
   some earlier ``secret`` effect registered (PART E.2: reuse the SAME slug
   across episodes, or later reveals attach to nothing).
3. **monotonic deaths** — the dead set only grows over time (a folded death at T
   is still dead at T+1); a resurrection signals a bad ledger edit.
4. **known speakers** — every episode speaker resolves to a story point on the
   canon axis (guards against malformed ``point`` fields).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from got_agents.cognition import canon_time
from got_agents.world import fold, load_ledger
from got_agents.world.types import LedgerEvent


@dataclass(frozen=True, slots=True)
class SmokeResult:
    point: str
    ok: bool
    failures: tuple[str, ...] = ()
    stats: dict[str, int] = field(default_factory=dict)

    def report(self) -> str:
        head = f"[{self.point}] {'OK' if self.ok else 'FAIL'}"
        if self.ok:
            bits = ", ".join(f"{k}={v}" for k, v in sorted(self.stats.items()))
            return f"{head}  ({bits})"
        return head + "\n" + "\n".join(f"    - {f}" for f in self.failures)


def _registered_secret_slugs(events: list[LedgerEvent]) -> set[str]:
    slugs: set[str] = set()
    for e in events:
        for eff in e.effects:
            if eff.get("op") == "secret" and eff.get("secret"):
                slugs.add(str(eff["secret"]))
    return slugs


def smoke_test_episode(
    point: str,
    *,
    ledger: list[LedgerEvent] | None = None,
    prev_point: str | None = None,
) -> SmokeResult:
    """Validate the cumulative ledger folded at ``point``.

    ``ledger`` defaults to the full on-disk ledger; ``prev_point`` (the previous
    episode) enables the monotonic-death check across episodes.
    """
    failures: list[str] = []
    full = ledger if ledger is not None else load_ledger()

    # 1. Folds clean (fold never raises on the closed EFFECT_OPS vocab; we assert
    #    the world is non-degenerate and consistent).
    try:
        world = fold(full, point)
    except Exception as exc:  # pragma: no cover - defensive
        return SmokeResult(point=point, ok=False, failures=(f"fold raised: {exc}",))

    overlap = world.dead & set(world.titles)
    if overlap:
        failures.append(f"dead characters still hold titles: {sorted(overlap)}")

    # 2. Secret-slug continuity: every learn references a registered secret.
    up_to = canon_time.code(point)
    in_window = [e for e in full if canon_time.code(e.point) <= up_to]
    registered = _registered_secret_slugs(in_window)
    for e in in_window:
        for eff in e.effects:
            if eff.get("op") == "learn":
                sid = str(eff.get("secret") or "")
                if sid and sid not in registered:
                    failures.append(
                        f"event {e.id!r}: learn references unknown secret {sid!r} "
                        "(reuse the registering slug)"
                    )

    # 3. Monotonic deaths vs the previous episode.
    if prev_point is not None:
        prev_world = fold(full, prev_point)
        resurrected = prev_world.dead - world.dead
        if resurrected:
            failures.append(
                f"dead at {prev_point} but alive at {point}: {sorted(resurrected)}"
            )

    # 4. Every event point parses on the canon axis.
    for e in in_window:
        try:
            canon_time.code(e.point)
        except ValueError:
            failures.append(f"event {e.id!r}: unparseable point {e.point!r}")

    stats = {
        "events": len(in_window),
        "dead": len(world.dead),
        "titles": len(world.titles),
        "secrets": len(world.secrets),
        "oaths": len(world.oaths),
    }
    return SmokeResult(
        point=point, ok=not failures, failures=tuple(failures), stats=stats
    )
