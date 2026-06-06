from __future__ import annotations

from dataclasses import dataclass, field

ACTION_VOCAB: tuple[str, ...] = (
    "speak",
    "accuse",
    "share_secret",
    "swear_oath",
    "ally",
    "pass",
)


@dataclass(frozen=True, slots=True)
class SceneLine:
    speaker: str
    action: str
    dialogue: str


@dataclass(frozen=True, slots=True)
class Perception:
    setting: str
    stakes: str
    cast: tuple[str, ...]
    speaker: str
    round: int
    history: tuple[SceneLine, ...] = ()

    def cue(self) -> str:
        if self.history:
            last = self.history[-1]
            return f"{self.stakes} — {last.speaker}: {last.dialogue}"
        return self.stakes


@dataclass(frozen=True, slots=True)
class Decision:
    action: str
    public_stance: str
    private_intent: str
    dialogue: str
    thinking: str
    target: str | None = None

    def as_line(self, speaker: str) -> SceneLine:
        return SceneLine(speaker=speaker, action=self.action, dialogue=self.dialogue)


@dataclass(frozen=True, slots=True)
class Appraisal:
    emotion: str
    drive_deltas: dict[str, float] = field(default_factory=dict)
    memory: str = ""
    concepts: tuple[str, ...] = ()
