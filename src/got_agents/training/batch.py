"""Batch trainer (PART C.7) — train the whole cast, then rank them.

Selects the most-speaking characters from the script, builds a core-less generic
genome for each (so we are not limited to the four hand-authored leads), and runs
the train/val/test evolution loop on every one — **in parallel across
characters**. Each character learns from Season 1 and is scored on unseen Season
2, so the final board is an honest cross-character fidelity leaderboard.

Two levels of parallelism stack here: characters run concurrently (a thread per
character) and, inside each, the reaction probes fan out across their own pool.
Keep ``char_workers`` modest so the combined LLM concurrency stays sane.
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from got_agents.agent.genome import Genome
from got_agents.data_pipeline import sources
from got_agents.training.ablation import generic_genome
from got_agents.training.evolution import TrainingRun, train_character
from got_agents.training.splits import TEST_EPISODES, TRAIN_EPISODES, VAL_EPISODES

# Script speakers that are not real, namable characters (crowd/anon lines).
_NON_CHARACTERS = frozenset({
    "man", "woman", "all", "boy", "girl", "guard", "soldier", "servant",
    "voice", "men", "both", "crowd", "child", "maester", "stableboy",
    "old man", "young man", "septon", "guardsman", "messenger", "narrator",
})

_CHAR_WORKERS = int(os.environ.get("GOT_CHAR_WORKERS", "3"))


@dataclass(frozen=True, slots=True)
class CharacterResult:
    csv_name: str
    key: str
    base_test: float  # gen-0 fidelity on unseen S2
    final_test: float  # best genome's fidelity on unseen S2
    test_delta: float  # generalization gain
    train_delta: float
    generations: int
    run: TrainingRun


def _season_count(csv_name: str, episodes: tuple[str, ...]) -> int:
    key = csv_name.strip().lower()
    return sum(
        1
        for ep in episodes
        for ln in sources.lines_in_episode(ep)
        if ln.speaker == key
    )


def select_cast(
    *, top: int = 8, min_train_lines: int = 25, min_test_lines: int = 12
) -> list[str]:
    """Pick the most-speaking real characters that have both S1 and S2 dialogue.

    A character must have enough Season-1 lines to learn from and enough unseen
    Season-2 lines to be honestly tested on. Characters who die in S1 (e.g. Ned)
    have no S2 lines and are excluded automatically.
    """
    s1 = TRAIN_EPISODES + VAL_EPISODES
    candidates: list[tuple[str, int]] = []
    for csv_name, total in sources.line_counts().most_common():
        if csv_name in _NON_CHARACTERS or total < min_train_lines:
            continue
        train_n = _season_count(csv_name, s1)
        test_n = _season_count(csv_name, TEST_EPISODES)
        if train_n >= min_train_lines and test_n >= min_test_lines:
            candidates.append((csv_name, train_n))
        if len(candidates) >= top:
            break
    return [name for name, _ in candidates[:top]]


def train_one(
    csv_name: str,
    *,
    generations: int = 1,
    anonymize: bool = True,
    save: bool = True,
) -> CharacterResult:
    """Train a single core-less character on S1, scored on unseen S2."""
    genome: Genome = generic_genome(csv_name, anonymize=anonymize)
    run = train_character(
        genome,
        generations=generations,
        eval_mode="reactions",
        speaker_csv_name=csv_name,
        save=save,
    )
    base_test = run.history[0].test_mean if run.history else 0.0
    final_test = max((g.test_mean for g in run.history), default=0.0)
    return CharacterResult(
        csv_name=csv_name,
        key=genome.key,
        base_test=base_test,
        final_test=final_test,
        test_delta=final_test - base_test,
        train_delta=run.delta,
        generations=generations,
        run=run,
    )


def train_many(
    csv_names: list[str],
    *,
    generations: int = 1,
    anonymize: bool = True,
    char_workers: int = _CHAR_WORKERS,
    save: bool = True,
) -> list[CharacterResult]:
    """Train every character concurrently; return results ranked by S2 fidelity.

    ``char_workers`` characters train at once. Each also fans its probes out
    internally, so the effective LLM concurrency is roughly
    ``char_workers * GOT_REACTION_WORKERS`` — keep it within your rate limit.

    A single character failing (e.g. a transient network drop) is logged and
    skipped rather than aborting the whole batch, so partial progress survives.
    """
    results: list[CharacterResult] = []
    workers = max(1, min(char_workers, len(csv_names)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                train_one, name, generations=generations,
                anonymize=anonymize, save=save,
            ): name
            for name in csv_names
        }
        for future in as_completed(futures):
            name = futures[future]
            try:
                results.append(future.result())
            except Exception as exc:  # one character's failure must not kill the batch
                print(f"  ! {name} failed: {type(exc).__name__}: {exc}")
    results.sort(key=lambda r: r.final_test, reverse=True)
    return results
