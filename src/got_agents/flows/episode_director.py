"""Episode director (L4) — a premise into an ordered, *continuous* episode.

Where :func:`scene_service.build_episode` runs a single one-shot batch of
parallel councils that never see each other, this stages an episode as an
**ordered sequence of acts** with state flowing forward between them:

* **One cast, carried across acts.** Lords are loaded once and reused, so a
  character's memory and drives persist — what they said and felt in Act I is
  with them in Act II (the same continuity the offline ``Director`` gives a
  skeleton, now driven by a live premise).
* **A shared world.** Every spoken decision is resolved into one
  :class:`WorldSnapshot`, so an alliance sworn or a secret shared in one act is
  true world-state for the next.
* **Re-forming groups.** Between acts the showrunner re-plans the groupings from
  a digest of what just happened, so allies converge, the wronged confront the
  wrongdoer, and pairs fracture — the cast physically regroups instead of
  resetting.

The result is a chronicle in the **acts** shape
(:func:`got_agents.outputs.ensemble_contract.to_ensemble` renders it), which the
world plays one act after another. Live compute: needs Redis + an LLM key; cost
scales with acts × groups × (rounds + appraisal).
"""

from __future__ import annotations

import concurrent.futures
from dataclasses import dataclass

import weave

from got_agents.agent import Lord
from got_agents.flows.council import CouncilTranscript, run_council
from got_agents.flows.scene_planner import (
    DEFAULT_MAX_GROUPS,
    HARD_MAX_GROUPS,
    ScenePlan,
    act_role,
    plan_act,
)
from got_agents.world import WorldSnapshot, fold, load_ledger, resolve
from got_agents.world.types import LedgerEvent

DEFAULT_NUM_ACTS = 3
HARD_MAX_ACTS = 5
DEFAULT_MAX_ROUNDS = 2

# A short, flavorful subtitle per narrative role (mirrors scene_planner roles).
_ROLE_TITLES: dict[str, str] = {
    "opening": "The Board Is Set",
    "rising": "Lines Are Drawn",
    "turn": "The Turn",
    "resolution": "Reckoning",
}

_ROMAN = ("I", "II", "III", "IV", "V", "VI", "VII", "VIII")

# Actions worth calling out in the between-act digest (everything but small talk).
_NOTABLE_ACTIONS = frozenset({"accuse", "share_secret", "swear_oath", "ally"})


def _act_title(act_index: int, total_acts: int) -> str:
    roman = _ROMAN[act_index] if act_index < len(_ROMAN) else str(act_index + 1)
    subtitle = _ROLE_TITLES.get(act_role(act_index, total_acts), "")
    return f"Act {roman} — {subtitle}" if subtitle else f"Act {roman}"


@dataclass(slots=True)
class _ActScene:
    """One council within an act, paired with its plan and resolved effects."""

    plan: ScenePlan
    transcript: CouncilTranscript
    effects: tuple[dict, ...]


class EpisodeDirector:
    """Stage a premise as an ordered, continuous, multi-act episode.

    ``roster`` is the spawnable cast as ``{"key", "name", "title", ...}`` dicts
    (the showrunner only references these keys). Lords are loaded lazily by key
    and cached, so memory/drives persist across acts.
    """

    def __init__(
        self,
        premise: str,
        roster: list[dict],
        *,
        episode: str,
        num_acts: int = DEFAULT_NUM_ACTS,
        max_groups: int = DEFAULT_MAX_GROUPS,
        max_rounds: int = DEFAULT_MAX_ROUNDS,
        appraise: bool = True,
        ledger: list[LedgerEvent] | None = None,
    ) -> None:
        premise = (premise or "").strip()
        if not premise:
            raise ValueError("a premise is required to direct an episode")
        if not roster:
            raise ValueError("no characters available to stage")
        self.premise = premise
        self.roster = roster
        self.episode = episode
        self.num_acts = max(1, min(int(num_acts), HARD_MAX_ACTS))
        self.max_groups = max(1, min(int(max_groups), HARD_MAX_GROUPS))
        self.max_rounds = max(1, min(int(max_rounds), 4))
        self.appraise = appraise
        self._ledger = ledger if ledger is not None else load_ledger()
        self.world: WorldSnapshot = fold(self._ledger, episode)
        # Lords cached across acts so memory/drives persist within the episode.
        self._lords: dict[str, Lord] = {}

    def _lord(self, key: str) -> Lord:
        lord = self._lords.get(key)
        if lord is None:
            lord = Lord.load(key, at_time=self.episode)
            self._lords[key] = lord
        return lord

    @weave.op
    def run(self) -> dict:
        """Run every act in order; return a chronicle in the *acts* shape."""
        acts_out: list[dict] = []
        prior_digest: str | None = None

        for act_index in range(self.num_acts):
            plans = plan_act(
                self.premise,
                self.roster,
                act_index=act_index,
                total_acts=self.num_acts,
                prior_digest=prior_digest,
                max_groups=self.max_groups,
                episode=self.episode,
            )
            if not plans:
                # No viable grouping for this act; end the episode early rather
                # than emit an empty act.
                break

            scenes = self._run_act(plans)
            acts_out.append(
                {
                    "title": _act_title(act_index, self.num_acts),
                    "scenes": [self._scene_dict(s) for s in scenes],
                }
            )
            # The next act is planned from everything that has happened so far.
            prior_digest = self._digest(acts_out)

        return {
            "episode": self.episode,
            "title": self.premise[:80],
            "acts": acts_out,
        }

    def _run_act(self, plans: list[ScenePlan]) -> list[_ActScene]:
        """Run an act's groups as concurrent councils, then resolve effects.

        Councils run in parallel (disjoint casts, reusing cached Lords). World
        effects are resolved sequentially afterwards so the shared snapshot is
        never mutated from multiple threads.
        """

        def run_one(index_plan: tuple[int, ScenePlan]) -> tuple[int, CouncilTranscript]:
            index, plan = index_plan
            cast = [self._lord(key) for key in plan.cast]
            transcript = run_council(
                cast,
                setting=plan.setting,
                stakes=plan.stakes,
                max_rounds=self.max_rounds,
                appraise=self.appraise,
            )
            return index, transcript

        workers = min(len(plans), 4)
        transcripts: dict[int, CouncilTranscript] = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            for index, transcript in pool.map(run_one, list(enumerate(plans))):
                transcripts[index] = transcript

        scenes: list[_ActScene] = []
        for index, plan in enumerate(plans):
            transcript = transcripts[index]
            effects: list[dict] = []
            for turn in transcript.turns:
                effects.extend(resolve(turn.decision, turn.speaker, self.world))
            scenes.append(_ActScene(plan, transcript, tuple(effects)))
        return scenes

    def _scene_dict(self, scene: _ActScene) -> dict:
        """Render one act-scene into the chronicle scene shape ``to_ensemble``
        consumes (keys for speakers/cast; per-scene mood inline)."""
        name_to_key = {
            self._lord(key).genome.name: key for key in scene.plan.cast
        }
        turns = []
        for turn in scene.transcript.turns:
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
        return {
            "setting": scene.plan.setting,
            "stakes": scene.plan.stakes,
            "mood": scene.plan.mood,
            "cast": list(scene.plan.cast),
            "turns": turns,
            "effects": [dict(e) for e in scene.effects],
        }

    def _digest(self, acts_out: list[dict]) -> str:
        """A compact, cumulative record of the episode so far for re-planning.

        Names each scene's cast + setting, the spoken lines, any notable action
        (ally/accuse/share_secret/swear_oath), and the world changes it caused —
        so the showrunner can stage the next act as a true continuation.
        """
        lines: list[str] = []
        for act in acts_out:
            lines.append(f"{act['title']}:")
            for scene in act["scenes"]:
                cast_names = ", ".join(self._name(k) for k in scene["cast"])
                setting = (scene.get("setting") or "").strip()
                lines.append(f"  [{setting}] — {cast_names}")
                for turn in scene["turns"]:
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
                for effect in scene.get("effects", []):
                    summary = _effect_summary(effect)
                    if summary:
                        lines.append(f"    → {summary}")
        return "\n".join(lines) or "(a quiet episode so far)"

    def _name(self, key: str) -> str:
        if not key:
            return ""
        try:
            return self._lord(key).genome.name
        except KeyError:
            return key.replace("_", " ").title()


def _effect_summary(effect: dict) -> str:
    """One-line, human-readable summary of a resolved world effect."""
    op = effect.get("op")
    who = effect.get("who")
    if op == "ally" and isinstance(who, list):
        return f"an alliance formed between {' and '.join(who)}"
    if op == "oath":
        return f"{effect.get('by')} swore an oath to {effect.get('to')}"
    if op == "secret":
        known = effect.get("known_to") or []
        if len(known) >= 2:
            return f"a secret passed between {' and '.join(known)}"
        return "a secret was registered"
    if op == "kill":
        return f"{who} was killed"
    if op == "title":
        return f"{who} took the title {effect.get('title')}"
    return ""


@weave.op
def direct_episode(
    premise: str,
    roster: list[dict],
    *,
    episode: str,
    num_acts: int = DEFAULT_NUM_ACTS,
    max_groups: int = DEFAULT_MAX_GROUPS,
    max_rounds: int = DEFAULT_MAX_ROUNDS,
    appraise: bool = True,
    ledger: list[LedgerEvent] | None = None,
) -> dict:
    """Convenience: build an :class:`EpisodeDirector` and run the episode."""
    return EpisodeDirector(
        premise,
        roster,
        episode=episode,
        num_acts=num_acts,
        max_groups=max_groups,
        max_rounds=max_rounds,
        appraise=appraise,
        ledger=ledger,
    ).run()
