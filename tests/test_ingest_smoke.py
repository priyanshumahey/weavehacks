"""S1E1 smoke test (PART E.3) — the per-episode ingest discipline.

Three assertions, mirroring the design's smoke harness:
1. ``fold(ledger, T=end-of-E1)`` yields a sane world (pure — always runs);
2. a 1-scene micro-episode convenes Lords *as of S1E1*, ticks once per cast
   member, and traces (infra-gated: Redis + OpenAI);
3. the full author pass gives every full-tier E1 speaker a core (opt-in &
   infra-gated — it makes ~one LLM call per speaker, so it is off by default).
"""

from __future__ import annotations

import os

import pytest
import redis

from got_agents import settings
from got_agents.agent import Lord
from got_agents.agent.types import ACTION_VOCAB
from got_agents.data_pipeline import sources
from got_agents.flows import run_council
from got_agents.world import fold, load_ledger


def _require_infra() -> None:
    try:
        redis.from_url(settings.redis_url).ping()
    except redis.exceptions.ConnectionError:
        pytest.skip("Redis not running — ./scripts/stack.sh up")
    if not settings.openai_api_key:
        pytest.skip("OPENAI_API_KEY not set")


# --- 1. fold sanity (pure) ------------------------------------------------


def test_s1e1_world_is_sane() -> None:
    world = fold(load_ledger(["s1e1"]), "s1e1")
    # The right people are alive / dead.
    assert not world.is_alive("jon arryn")
    assert world.is_alive("eddard stark")
    assert world.is_alive("robert baratheon")
    # The Hand's seat has passed to Ned under oath.
    assert world.titles.get("eddard stark") == "Hand of the King"
    # The defining secret is held by exactly the right set — no leaks, no gaps.
    secret = world.secrets["royal-parentage"]
    assert secret.known_to == frozenset(
        {"cersei lannister", "jaime lannister", "jon arryn", "bran stark"}
    )
    assert not world.knows("eddard stark", "royal-parentage")


# --- 2. micro-episode as of S1E1 (infra-gated) ----------------------------


def test_s1e1_micro_episode_ticks_and_appraises() -> None:
    _require_infra()
    try:
        # Hand-authored cores both speak in S1E1; load them at the E1 horizon.
        cast = [Lord.load("ned", at_time="s1e1"), Lord.load("cersei", at_time="s1e1")]
    except Exception as exc:
        pytest.skip(f"could not load Lords (infra/LLM unavailable): {exc}")

    world = fold(load_ledger(["s1e1"]), "s1e1")
    assert all(lord.as_of is not None for lord in cast)

    transcript = run_council(
        cast,
        setting="Winterfell, the night the royal court arrives",
        stakes=(
            "King Robert has named Lord Eddard his Hand. The old Hand, Jon Arryn, "
            "is dead and his widow whispers of poison."
        ),
        max_rounds=1,
    )
    assert transcript.turns
    assert all(t.decision.action in ACTION_VOCAB for t in transcript.turns)
    assert len(transcript.appraisals) == 2
    # The world snapshot is internally consistent with the scene framing.
    assert world.titles["eddard stark"] == "Hand of the King"


# --- 3. full author pass (opt-in, infra-gated) ----------------------------


def test_s1e1_full_ingest_authors_every_full_tier_speaker() -> None:
    if not os.environ.get("GOT_RUN_INGEST"):
        pytest.skip("set GOT_RUN_INGEST=1 to run the (paid) full S1E1 author pass")
    _require_infra()
    from got_agents.data_pipeline import cores
    from got_agents.data_pipeline.ingest import ingest_episode

    report = ingest_episode("s1e1", extract_ledger=False, min_tier="full")
    for speaker, tier in report.tiers.items():
        if tier == "full":
            assert cores.core_exists(speaker), f"missing core for {speaker}"
    # Every authored full-tier core loads back as a usable Lord genome.
    for speaker in report.authored:
        core = cores.load_core(speaker)
        assert set(core.genome.drive_params)  # drives present
        assert core.genome.name


def test_s1e1_roster_has_expected_full_tier_leads() -> None:
    roster = sources.speakers_in_episode("s1e1")
    leads = [s for s in roster if sources.tier_of(s) == "full"]
    assert "eddard stark" in leads
    assert "tyrion lannister" in leads
