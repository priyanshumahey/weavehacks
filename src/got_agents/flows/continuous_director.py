"""Continuous director (L4) — a premise into one continuous, multi-thread episode.

This is the richer sibling of :class:`EpisodeDirector`. Instead of acts that
re-form everyone in lockstep, it stages the episode as a CONTINUOUS timeline of
conversation **threads** that begin, run, and finish independently while
characters move between them with motive — someone exiled walks to the Wall, an
ally crosses the room to join a plot, a lord storms over to confront a rival.

State flows forward exactly as in the act director — Lords are cached so memory
and drives persist, every spoken action mutates a shared world, and each phase
is planned from a digest of what just happened — but with two additions:

* **Per-thread location.** Each thread chooses a map location, so the world can
  cut between the throne room and the Wall and the cast physically travels.
* **Captured learning.** Councils run with appraisal ON, so after each thread the
  agents' drives shift and memories form. The director records per-thread drive
  deltas + emotion, a per-character drive trajectory, and end-of-episode
  reflections — the evidence the agents are growing.

The output is a ``script_chronicle`` dict that
:func:`got_agents.outputs.episode_script.to_episode_script` renders into the
continuous-timeline contract the world plays. Live compute: needs Redis + an LLM
key; cost scales with phases × threads × (rounds + appraisal) + reflection.
"""

from __future__ import annotations

import concurrent.futures
import logging

import weave

from got_agents.agent import Lord
from got_agents.flows.council import CouncilTranscript, run_council
from got_agents.flows.scene_planner import (
    DEFAULT_MAX_GROUPS,
    HARD_MAX_GROUPS,
    PhaseThread,
    act_role,
    plan_phase,
)
from got_agents.world import WorldSnapshot, fold, load_ledger, resolve
from got_agents.world.types import LedgerEvent

_log = logging.getLogger("got_agents.continuous_director")

DEFAULT_NUM_PHASES = 4
HARD_MAX_PHASES = 8
DEFAULT_MAX_ROUNDS = 2

# Actions worth calling out in the between-phase digest.
_NOTABLE_ACTIONS = frozenset({"accuse", "share_secret", "swear_oath", "ally"})

_ROLE_TITLES: dict[str, str] = {
    "opening": "The Board Is Set",
    "rising": "Lines Are Drawn",
    "turn": "The Turn",
    "resolution": "Reckoning",
}


class ContinuousDirector:
    """Stage a premise as one continuous, multi-thread, learning episode.

    ``roster`` is the spawnable cast as ``{"key", "name", "title", ...}`` dicts.
    ``locations`` is ``[{"id", "label"}]`` of the map locations threads may use;
    the first is where everyone starts. Lords are cached so memory/drives persist
    across the whole episode.
    """

    def __init__(
        self,
        premise: str,
        roster: list[dict],
        *,
        episode: str,
        locations: list[dict],
        num_phases: int = DEFAULT_NUM_PHASES,
        max_threads: int = DEFAULT_MAX_GROUPS,
        max_rounds: int = DEFAULT_MAX_ROUNDS,
        reflect: bool = True,
        ledger: list[LedgerEvent] | None = None,
    ) -> None:
        premise = (premise or "").strip()
        if not premise:
            raise ValueError("a premise is required to direct an episode")
        if not roster:
            raise ValueError("no characters available to stage")
        if not locations:
            raise ValueError("at least one location is required")
        self.premise = premise
        self.roster = roster
        self.episode = episode
        self.locations = locations
        self.start_location = locations[0]["id"]
        self.num_phases = max(1, min(int(num_phases), HARD_MAX_PHASES))
        self.max_threads = max(1, min(int(max_threads), HARD_MAX_GROUPS))
        self.max_rounds = max(1, min(int(max_rounds), 4))
        self.reflect = reflect
        self._ledger = ledger if ledger is not None else load_ledger()
        self.world: WorldSnapshot = fold(self._ledger, episode)
        self._lords: dict[str, Lord] = {}
        # Every character starts at the first location.
        self._where: dict[str, str] = {
            c["key"]: self.start_location for c in roster
        }
        # Per-character drive trajectory: [{"thread", "drives": {...}}].
        self._trajectory: dict[str, list[dict]] = {}

    def _lord(self, key: str) -> Lord:
        lord = self._lords.get(key)
        if lord is None:
            lord = Lord.load(key, at_time=self.episode)
            self._lords[key] = lord
        return lord

    @weave.op
    def run(self) -> dict:
        """Run every phase; return a ``script_chronicle`` dict."""
        threads_out: list[dict] = []
        prior_digest: str | None = None
        thread_counter = 0
        roster_keys = {c["key"] for c in self.roster}

        for phase_index in range(self.num_phases):
            present = {k: loc for k, loc in self._where.items() if k in roster_keys}
            plans = self._plan_phase_resilient(phase_index, present, prior_digest)
            if not plans:
                # Still nothing — skip this phase but keep going; later phases
                # may still stage scenes.
                continue

            phase_threads = self._run_phase(plans, phase_index, thread_counter)
            thread_counter += len(phase_threads)
            threads_out.extend(phase_threads)

            # Characters now stand where their thread happened.
            for plan in plans:
                for key in plan.cast:
                    self._where[key] = plan.location

            prior_digest = self._digest(threads_out)

        learning: dict = {"driveTrajectory": self._trajectory}
        if self.reflect and self._lords:
            learning["reflections"] = self._reflect_all(threads_out)

        return {
            "episode": self.episode,
            "title": self.premise[:80],
            "premise": self.premise,
            "threads": threads_out,
            "learning": learning,
        }

    def _plan_phase_resilient(
        self, phase_index: int, present: dict[str, str], prior_digest: str | None
    ) -> list[PhaseThread]:
        """Plan a phase, tolerating transient failures and stochastic empties.

        Tries up to twice; a planning exception or empty result on the first try
        is retried once, and any exception is swallowed so one bad phase never
        aborts the whole episode (later phases may still stage scenes)."""
        for attempt in (1, 2):
            try:
                plans = plan_phase(
                    self.premise,
                    self.roster,
                    locations=self.locations,
                    character_locations=present,
                    phase_index=phase_index,
                    total_phases=self.num_phases,
                    prior_digest=prior_digest,
                    max_threads=self.max_threads,
                    episode=self.episode,
                )
                if plans:
                    return plans
            except Exception:  # noqa: BLE001 — keep the episode going
                _log.exception(
                    "plan_phase failed (phase %d, attempt %d)", phase_index, attempt
                )
        return []

    def _run_phase(
        self, plans: list[PhaseThread], phase_index: int, id_base: int
    ) -> list[dict]:
        """Run a phase's threads as concurrent councils, capture learning,
        resolve world effects, and return them as chronicle thread dicts."""

        def run_one(
            index_plan: tuple[int, PhaseThread],
        ) -> tuple[int, CouncilTranscript | None]:
            index, plan = index_plan
            try:
                cast = [self._lord(key) for key in plan.cast]
                transcript = run_council(
                    cast,
                    setting=plan.setting,
                    stakes=plan.stakes,
                    max_rounds=self.max_rounds,
                    appraise=True,
                )
                return index, transcript
            except Exception:  # noqa: BLE001 — one bad thread must not kill the phase
                _log.exception("council failed for thread %d (%s)", index, plan.cast)
                return index, None

        workers = min(len(plans), 4)
        transcripts: dict[int, CouncilTranscript] = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for index, transcript in pool.map(run_one, list(enumerate(plans))):
                if transcript is not None:
                    transcripts[index] = transcript

        threads: list[dict] = []
        for index, plan in enumerate(plans):
            transcript = transcripts.get(index)
            if transcript is None:
                continue  # this council failed after retries; skip it
            tid = f"thread-{id_base + index}"
            # Resolve world effects sequentially (shared snapshot).
            for turn in transcript.turns:
                resolve(turn.decision, turn.speaker, self.world)
            threads.append(
                self._thread_dict(tid, phase_index, plan, transcript)
            )
        return threads

    def _thread_dict(
        self,
        tid: str,
        phase_index: int,
        plan: PhaseThread,
        transcript: CouncilTranscript,
    ) -> dict:
        name_to_key = {self._lord(key).genome.name: key for key in plan.cast}
        turns = []
        for turn in transcript.turns:
            d = turn.decision
            turns.append(
                {
                    "round": turn.round,
                    "speaker": name_to_key.get(turn.speaker, turn.speaker),
                    "action": d.action,
                    "target": d.target,
                    "dialogue": d.dialogue,
                    "public_stance": d.public_stance,
                    "private_intent": d.private_intent,
                    "thinking": d.thinking,
                }
            )

        # Learning: per-character drive deltas + emotion from this scene's
        # appraisal, and a snapshot of the resulting drive levels (trajectory).
        drive_deltas: dict[str, dict] = {}
        emotion: dict[str, str] = {}
        for key in plan.cast:
            lord = self._lord(key)
            appraisal = transcript.appraisals.get(lord.genome.name)
            if appraisal is not None:
                if getattr(appraisal, "drive_deltas", None):
                    drive_deltas[key] = {
                        n: round(float(v), 1)
                        for n, v in appraisal.drive_deltas.items()
                    }
                if getattr(appraisal, "emotion", ""):
                    emotion[key] = appraisal.emotion
            self._trajectory.setdefault(key, []).append(
                {
                    "thread": tid,
                    "drives": {
                        n: round(float(v), 1) for n, v in lord.drives.values.items()
                    },
                }
            )

        return {
            "id": tid,
            "phase": phase_index,
            "location": plan.location,
            "mood": plan.mood,
            "setting": plan.setting,
            "stakes": plan.stakes,
            "cast": list(plan.cast),
            "turns": turns,
            "driveDeltas": drive_deltas,
            "emotion": emotion,
        }

    def _reflect_all(self, threads_out: list[dict]) -> dict:
        """Each live Lord consolidates the episode into durable self-knowledge.

        A failed reflection for one character is skipped, not fatal — the episode
        and the other characters' reflections still complete."""
        digest = self._digest(threads_out)
        trigger = f"the events of {self.episode}"
        reflections: dict[str, dict] = {}
        for lord in self._lords.values():
            try:
                reflection = lord.reflect(trigger, digest)
            except Exception:  # noqa: BLE001 — one bad reflection must not abort
                _log.exception("reflection failed for %s", lord.genome.name)
                continue
            reflections[lord.genome.name] = {
                "summary": reflection.summary,
                "rules": list(reflection.rules),
                "relationships": dict(reflection.relationships),
            }
        return reflections

    def _digest(self, threads_out: list[dict]) -> str:
        """A compact, cumulative record of the episode so far for re-planning."""
        lines: list[str] = []
        by_phase: dict[int, list[dict]] = {}
        for thread in threads_out:
            by_phase.setdefault(thread["phase"], []).append(thread)
        for phase in sorted(by_phase):
            subtitle = _ROLE_TITLES.get(act_role(phase, self.num_phases), "")
            lines.append(f"Phase {phase + 1} — {subtitle}:")
            for thread in by_phase[phase]:
                cast_names = ", ".join(self._name(k) for k in thread["cast"])
                loc = thread.get("location", "")
                setting = (thread.get("setting") or "").strip()
                lines.append(f"  [{loc}] {setting} — {cast_names}")
                for turn in thread["turns"]:
                    speaker = self._name(turn["speaker"])
                    action = turn.get("action", "speak")
                    spoken = (turn.get("dialogue") or "").strip()
                    if action in _NOTABLE_ACTIONS:
                        target = self._name(turn["target"]) if turn.get("target") else ""
                        verb = action.replace("_", " ")
                        toward = f" {target}" if target else ""
                        lines.append(f"    {speaker} ({verb}{toward}): {spoken}")
                    elif spoken:
                        lines.append(f"    {speaker}: {spoken}")
        return "\n".join(lines) or "(a quiet episode so far)"

    def _name(self, key: str) -> str:
        if not key:
            return ""
        try:
            return self._lord(key).genome.name
        except KeyError:
            return key.replace("_", " ").title()


@weave.op
def direct_continuous_episode(
    premise: str,
    roster: list[dict],
    *,
    episode: str,
    locations: list[dict],
    num_phases: int = DEFAULT_NUM_PHASES,
    max_threads: int = DEFAULT_MAX_GROUPS,
    max_rounds: int = DEFAULT_MAX_ROUNDS,
    reflect: bool = True,
    ledger: list[LedgerEvent] | None = None,
) -> dict:
    """Convenience: build a :class:`ContinuousDirector` and run the episode."""
    return ContinuousDirector(
        premise,
        roster,
        episode=episode,
        locations=locations,
        num_phases=num_phases,
        max_threads=max_threads,
        max_rounds=max_rounds,
        reflect=reflect,
        ledger=ledger,
    ).run()
