"""Director (L4) — the lean episode spine.

Walks a seed :class:`EpisodeSkeleton` beat by beat: convene the beat's cast in a
council (reusing the L3 ``run_council`` flow), resolve each spoken decision into
the **live world snapshot** (so actions finally change shared state), and stop
when the beats are exhausted. Offline, sequential, deterministic given the seed.

What it does NOT do yet (deferred from PART B): emergent drive/event-driven scene
insertion, a Redis-backed world store, a membership-filtered event bus, per-tick
chronicle snapshots. The Director *frames* (who / where / stakes / order); the
agents *decide* what to say — the iron rule.
"""

from __future__ import annotations

import weave

from got_agents.agent import Lord
from got_agents.flows import run_council
from got_agents.orchestration.types import (
    Beat,
    EpisodeResult,
    EpisodeSkeleton,
    SceneResult,
)
from got_agents.world import WorldSnapshot, fold, load_ledger, resolve
from got_agents.world.types import LedgerEvent


class Director:
    """Schedules scenes over a folded world and resolves their outcomes."""

    def __init__(
        self,
        skeleton: EpisodeSkeleton,
        *,
        ledger: list[LedgerEvent] | None = None,
        appraise: bool = True,
        reflect: bool = True,
    ) -> None:
        self.skeleton = skeleton
        self.ledger = ledger if ledger is not None else load_ledger()
        self.appraise = appraise
        self.reflect = reflect
        # Lords are cached across beats so memory/drives persist within an
        # episode — a scene actually changes the agents that recur later.
        self._lords: dict[str, Lord] = {}

    def _lord(self, key: str) -> Lord:
        lord = self._lords.get(key)
        if lord is None:
            lord = Lord.load(key, at_time=self.skeleton.episode)
            self._lords[key] = lord
        return lord

    @weave.op
    def run(self) -> EpisodeResult:
        point = self.skeleton.episode
        world: WorldSnapshot = fold(self.ledger, point)
        result = EpisodeResult(
            episode=point,
            title=self.skeleton.title,
            world_start=fold(self.ledger, point),  # immutable copy for the record
        )
        for beat in self.skeleton.beats:
            result.scenes.append(self._run_beat(beat, world))
        result.world_end = world
        if self.reflect:
            result.reflections = self._reflect_all(result)
        return result

    def _reflect_all(self, result: EpisodeResult) -> dict[str, object]:
        """Each live Lord consolidates the episode into durable self-knowledge."""
        digest = self._episode_digest(result)
        trigger = f"the events at {self.skeleton.episode}"
        reflections: dict[str, object] = {}
        for key, lord in self._lords.items():
            reflections[lord.genome.name] = lord.reflect(trigger, digest)
        return reflections

    @staticmethod
    def _episode_digest(result: EpisodeResult) -> str:
        """A compact public record of the episode to anchor reflection."""
        lines: list[str] = []
        for i, scene in enumerate(result.scenes, 1):
            lines.append(f"Scene {i} — {scene.beat.setting}:")
            for turn in scene.transcript.turns:
                spoken = turn.decision.dialogue.strip()
                if spoken:
                    lines.append(f"  {turn.speaker}: {spoken}")
        return "\n".join(lines) or "(a quiet episode)"

    @weave.op
    def _run_beat(self, beat: Beat, world: WorldSnapshot) -> SceneResult:
        cast = [self._lord(key) for key in beat.cast]
        transcript = run_council(
            cast,
            setting=beat.setting,
            stakes=beat.stakes,
            max_rounds=beat.max_rounds,
            appraise=self.appraise,
        )
        effects: list[dict] = []
        for turn in transcript.turns:
            effects.extend(resolve(turn.decision, turn.speaker, world))
        return SceneResult(beat=beat, transcript=transcript, effects=tuple(effects))


@weave.op
def run_episode(
    skeleton: EpisodeSkeleton,
    *,
    ledger: list[LedgerEvent] | None = None,
    appraise: bool = True,
    reflect: bool = True,
) -> EpisodeResult:
    """Convenience: build a Director and run the whole skeleton."""
    return Director(
        skeleton, ledger=ledger, appraise=appraise, reflect=reflect
    ).run()
