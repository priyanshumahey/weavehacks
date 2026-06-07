"""Held-out canon backtest — the fidelity evaluation dataset (PART C.3, C.6).

Two halves, both fixed and independent of any evolving genome:

- **probes**: held-out scene cues a character must respond to in-voice. These are
  the *measurement* set — never used to author or mutate a genome, so a higher
  score means genuinely better fidelity, not overfitting (PART C.6 held-out
  battery).
- **references**: the authentic canon profile (real voice lines + a short canon
  description) the judge scores against. Anchoring on canon — not the evolving
  persona — is what stops the agent from gaming the judge by rewriting its own
  rubric.

Voice lines are short derived snippets from ``data/Game_of_Thrones_Script.csv``.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class CanonReference:
    key: str
    name: str
    canon_note: str
    voice_lines: tuple[str, ...]

    def as_prompt(self) -> str:
        lines = "\n".join(f'  - "{line}"' for line in self.voice_lines)
        return (
            f"Character: {self.name}\n"
            f"Canon: {self.canon_note}\n"
            f"How they truly sound (real lines):\n{lines}"
        )


@dataclass(frozen=True, slots=True)
class Probe:
    character: str  # registry key
    cue: str  # the held-out situation to respond to


_REFERENCES: dict[str, CanonReference] = {
    "cersei": CanonReference(
        key="cersei",
        name="Cersei Lannister",
        canon_note=(
            "Queen, Tywin's daughter; proud, cold, ruthless in defense of her "
            "children; treats mercy as weakness and rivals as prey."
        ),
        voice_lines=(
            "When you play the game of thrones, you win or you die.",
            "Everyone who isn't us is an enemy.",
            "I choose violence.",
            "Power is power.",
        ),
    ),
    "ned": CanonReference(
        key="ned",
        name="Eddard Stark",
        canon_note=(
            "Lord of Winterfell, the King's Hand; honorable to a fault, plain-"
            "spoken, duty before comfort; the man who passes the sentence swings "
            "the sword."
        ),
        voice_lines=(
            "The man who passes the sentence should swing the sword.",
            "Winter is coming.",
            "When the snows fall and the white winds blow, the lone wolf dies "
            "but the pack survives.",
            "I followed Robert onto the field of battle. I will not dishonor his "
            "memory.",
        ),
    ),
    "littlefinger": CanonReference(
        key="littlefinger",
        name="Petyr Baelish",
        canon_note=(
            "Master of coin, born small and climbed by cunning; trades in secrets "
            "and chaos; sounds courteous while every word is a wager."
        ),
        voice_lines=(
            "Chaos isn't a pit. Chaos is a ladder.",
            "Knowledge is power.",
            "Always keep your foes confused. If they don't know who you are, they "
            "can't know what you want.",
            "A man with no motive is a man no one suspects.",
        ),
    ),
    "stannis": CanonReference(
        key="stannis",
        name="Stannis Baratheon",
        canon_note=(
            "Robert's brother and the rightful heir by law; rigid, humorless, "
            "literal; duty and the letter of the law above all."
        ),
        voice_lines=(
            "I will not become a page in someone else's history book.",
            "A good act does not wash out the bad, nor a bad the good.",
            "The Iron Throne is mine by right.",
        ),
    ),
}


# Held-out situations — distinct from any scene we would train on. Each asks the
# character to speak in a fresh moment so the eval measures voice, not memorized
# lines.
_PROBES: tuple[Probe, ...] = (
    Probe("cersei", "A rival lord questions your son's right to the throne in open court. Answer him."),
    Probe("cersei", "Your maester counsels mercy toward a captured enemy. Tell him why he is wrong."),
    Probe("ned", "A deserter begs for his life before you carry out the sentence. Speak to him."),
    Probe("ned", "A courtier offers you gold to overlook a crime against the crown. Refuse him."),
    Probe("littlefinger", "A great lord asks plainly whose side you are on. Reply."),
    Probe("littlefinger", "You stand to gain from two rivals going to war. Muse on it aloud."),
    Probe("stannis", "Advisors urge you to bend the law to win allies. Reject the idea."),
)


def references() -> dict[str, CanonReference]:
    return dict(_REFERENCES)


def reference_for(key: str) -> CanonReference | None:
    return _REFERENCES.get(key)


def probes(characters: tuple[str, ...] | None = None) -> list[Probe]:
    if characters is None:
        return list(_PROBES)
    wanted = set(characters)
    return [p for p in _PROBES if p.character in wanted]
