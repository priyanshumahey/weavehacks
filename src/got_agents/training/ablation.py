"""Ablation — a deliberately weakened starting genome (PART C demo).

Our authored cores are already near-ceiling on fidelity, leaving no room for the
training loop to *visibly* climb. ``blank_genome`` strips a character down to a
generic, near-anonymous persona — the same name and drives, but a vague "a lord
of Westeros" self-image with no voice anchors, exemplars, or rules. Training then
has to **rebuild** the character from its memories, drives, and the held-out
feedback, producing a real gen-0 -> gen-N climb you can put on a leaderboard.

This is a labelled ablation experiment, not a claim that the authored cores are
weak — it isolates how much the evolution loop can recover from a blank slate.
"""

from __future__ import annotations

from got_agents.agent.genome import Genome
from got_agents.characters import get_character
from got_agents.cognition.drives import DRIVES

_GENERIC_PERSONA = (
    "A highborn lord or lady of Westeros of no particular distinction. You speak "
    "plainly and politely, without strong opinions, sharp wit, or memorable "
    "manner."
)
_GENERIC_MOTIVE = "Get through the day without trouble and keep your standing."
# A neutral display name so the model cannot lean on its prior knowledge of a
# famous character. The fidelity JUDGE still scores against the real canon (it
# uses the registry key, not this name), so the only honest way to raise the
# score is for training to rebuild the character's actual voice.
_ANON_NAME = "a noble of Westeros"


def blank_genome(key: str, *, anonymize: bool = True) -> Genome:
    """Return a stripped-down, low-fidelity starting genome for ``key``.

    Keeps the real drive params (so the character is still mechanically
    themselves) but blanks the persona, motive, voice anchors, and evolved
    guidance. With ``anonymize`` (default), the *display name* is generic too, so
    the model cannot recall the famous character from its name — leaving genuine
    headroom for the evolution loop to climb into.
    """
    base = get_character(key).genome
    return Genome(
        key=base.key,
        name=_ANON_NAME if anonymize else base.name,
        title="",
        self_persona=_GENERIC_PERSONA,
        life_motive=_GENERIC_MOTIVE,
        voice_anchors=(),
        fixed_bag=base.fixed_bag,
        drive_params=dict(base.drive_params),
        generation=0,
        reflection_rules=(),
        canon_exemplars=(),
    )


def slugify(csv_name: str) -> str:
    """Turn a script speaker name into a genome key (``"Tyrion Lannister"`` -> ``"tyrion_lannister"``)."""
    return "_".join(csv_name.strip().lower().split())


def generic_genome(csv_name: str, *, anonymize: bool = True) -> Genome:
    """Build a blank starting genome for ANY script speaker — no authored core.

    This is what lets us train the *whole cast*, not just the four hand-authored
    leads. The character starts generic (neutral drives, vague persona, no voice)
    and the evolution loop rebuilds their real voice from held-out canon scenes.
    With ``anonymize`` (default), the display name is generic too, so the model
    cannot lean on its prior knowledge of a famous character — leaving honest
    headroom for the climb.
    """
    name = csv_name.strip()
    display = _ANON_NAME if anonymize else name.title()
    return Genome(
        key=slugify(name),
        name=display,
        title="",
        self_persona=_GENERIC_PERSONA,
        life_motive=_GENERIC_MOTIVE,
        voice_anchors=(),
        fixed_bag=(),
        drive_params={drive: 50.0 for drive in DRIVES},
        generation=0,
        reflection_rules=(),
        canon_exemplars=(),
    )
