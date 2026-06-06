"""Action resolution (L4) — a Lord's ``Decision`` -> world effects.

The Stage-Manager piece, kept deliberately lean (no Redis, no MCP server, no odds
tables): translate one typed-core action into the closed EFFECT_OPS vocabulary
and let :meth:`WorldSnapshot.apply` mutate the live world. This is where a
decision finally *matters* — ``ally`` forms a real alliance, ``share_secret``
adds someone to a secret's ``known_to``, ``swear_oath`` records an oath.

Big moves are **declared and abstractly resolved**, never simulated (PART B.2).
Effects are returned (not just applied) so the Director can log what each
decision changed in the chronicle.
"""

from __future__ import annotations

import re

from got_agents.agent.types import Decision
from got_agents.world.types import WorldSnapshot

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _secret_slug(speaker: str, target: str | None) -> str:
    who = "-".join(p for p in (speaker, target or "") if p)
    return "pact:" + _SLUG_RE.sub("-", who.lower()).strip("-")


def resolve(
    decision: Decision, speaker: str, world: WorldSnapshot
) -> list[dict]:
    """Resolve one decision against ``world``, mutating it; return the effects.

    Only state-changing typed-core actions produce effects; ``speak``/``pass``
    (and anything unmapped) change nothing and return ``[]``. Names are
    lowercased so live writes share the ledger's casing convention.
    """
    speaker = speaker.strip().lower()
    effects = _effects_for(decision, speaker, world)
    for effect in effects:
        world.apply(effect)
    return effects


def _effects_for(
    decision: Decision, speaker: str, world: WorldSnapshot
) -> list[dict]:
    action = decision.action
    target = decision.target.strip().lower() if decision.target else None

    if action == "ally" and target:
        return [{"op": "ally", "who": [speaker, target]}]

    if action == "swear_oath" and target:
        return [
            {
                "op": "oath",
                "by": speaker,
                "to": target,
                "terms": decision.public_stance or "a sworn oath",
            }
        ]

    if action == "share_secret" and target:
        # Reveal the speaker's own secrets to the target. If the speaker holds
        # none on record, register the disclosed intent as a new pact secret so
        # the who-knows-what graph still grows.
        held = world.secrets_known_to(speaker)
        if held:
            return [
                {"op": "learn", "secret": s.id, "who": target} for s in held
            ]
        sid = _secret_slug(speaker, target)
        fact = decision.private_intent or decision.public_stance or "a shared confidence"
        return [
            {
                "op": "secret",
                "secret": sid,
                "fact": fact,
                "known_to": [speaker, target],
            }
        ]

    # accuse / speak / pass: no durable world write in the lean resolver.
    return []
