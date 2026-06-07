"""Pure-logic tests for the training foundation (no Redis, no OpenAI)."""

from __future__ import annotations

from got_agents.characters import get_character
from got_agents.training import dataset
from got_agents.training.fidelity_ref import LineFidelity, _judge  # noqa: F401
from got_agents.training.genome_io import from_dict, to_dict


def test_genome_roundtrips_with_evolved_fields() -> None:
    base = get_character("cersei").genome
    evolved = base.evolved(
        reflection_rules=("never show fear before the court",),
        canon_exemplars=("Power is power.",),
        generation=3,
    )
    restored = from_dict(to_dict(evolved))
    assert restored.generation == 3
    assert restored.reflection_rules == ("never show fear before the court",)
    assert restored.canon_exemplars == ("Power is power.",)
    # Non-evolved fields are preserved.
    assert restored.name == base.name
    assert restored.drive_params == base.drive_params


def test_evolved_does_not_mutate_original() -> None:
    base = get_character("ned").genome
    base.evolved(generation=9, reflection_rules=("x",))
    assert base.generation == 0
    assert base.reflection_rules == ()


def test_identity_carries_evolved_guidance_into_prompt() -> None:
    from got_agents.agent import prompts

    genome = get_character("cersei").genome.evolved(
        reflection_rules=("answer threats with sharper threats",),
        canon_exemplars=("When you play the game of thrones, you win or you die.",),
    )
    system = prompts.system_prompt(genome.identity(), genome.drives(), memories=[])
    assert "sharper threats" in system
    assert "win or you die" in system


def test_probes_are_filtered_by_character() -> None:
    cersei_probes = dataset.probes(("cersei",))
    assert cersei_probes
    assert all(p.character == "cersei" for p in cersei_probes)
    # Every probe character has a reference to judge against.
    for probe in dataset.probes():
        assert dataset.reference_for(probe.character) is not None


def test_references_have_canon_voice() -> None:
    refs = dataset.references()
    assert {"cersei", "ned", "littlefinger", "stannis"} <= set(refs)
    for ref in refs.values():
        assert ref.voice_lines
        assert ref.name
        # The rendered prompt includes canon lines.
        assert ref.voice_lines[0] in ref.as_prompt()


def test_reaction_probes_are_real_scenes() -> None:
    from got_agents.training.canon_scenes import reaction_probes

    # TRAIN split (Season 1) — the operators are allowed to mine these.
    probes = reaction_probes("cersei", episodes=("s1e8", "s1e9", "s1e10"), max_probes=4)
    assert probes, "expected real Cersei scenes in late S1"
    for p in probes:
        # Gold is the character's real line; context comes from the script.
        assert p.gold_line
        assert p.gold_speaker == "Cersei Lannister"
        # At least one context line is from someone else (a genuine reaction).
        assert any(name != "Cersei Lannister" for name, _ in p.context)
        assert p.point in {"s1e8", "s1e9", "s1e10"}


def test_train_test_split_learns_early_seasons_tests_future() -> None:
    from got_agents.training.fidelity_eval import DEFAULT_REACTION_EPISODES
    from got_agents.training.splits import TEST_EPISODES, TRAIN_EPISODES, VAL_EPISODES

    # Learn from Seasons 1-3, select on the S3 tail, test on unseen Season 4.
    assert all(e[:2] in {"s1", "s2", "s3"} for e in TRAIN_EPISODES)
    assert all(e.startswith("s3") for e in VAL_EPISODES)
    assert all(e.startswith("s4") for e in TEST_EPISODES)
    # Three disjoint sets — an operator never sees a selected or measured scene.
    assert not set(TRAIN_EPISODES) & set(VAL_EPISODES)
    assert not set(TRAIN_EPISODES) & set(TEST_EPISODES)
    assert not set(VAL_EPISODES) & set(TEST_EPISODES)
    # The reaction eval defaults to the held-out TEST split.
    assert DEFAULT_REACTION_EPISODES == TEST_EPISODES


def test_season_2_probes_are_unseen_future_scenes() -> None:
    from got_agents.training.canon_scenes import reaction_probes

    # The honest measurement: Cersei reacting in S2, never shown to the operators.
    probes = reaction_probes("cersei", episodes=("s2e1", "s2e2", "s2e3"), max_probes=4)
    assert probes, "expected real Cersei scenes in early S2"
    for p in probes:
        assert p.gold_speaker == "Cersei Lannister"
        assert p.point.startswith("s2")


def test_strip_quotes_removes_wrapping_marks() -> None:
    from got_agents.training.character_model import _strip_quotes

    assert _strip_quotes('"Power is power."') == "Power is power."
    assert _strip_quotes("“When you play the game of thrones…”") == "When you play the game of thrones…"
    assert _strip_quotes("'A man with no motive.'") == "A man with no motive."
    # No wrapping quotes: unchanged.
    assert _strip_quotes("Chaos is a ladder.") == "Chaos is a ladder."
    # An internal quote is preserved.
    assert _strip_quotes('He said "no" to me.') == 'He said "no" to me.'


def test_blank_genome_strips_voice_but_keeps_mechanics() -> None:
    from got_agents.training.ablation import blank_genome

    base = get_character("cersei").genome
    blank = blank_genome("cersei")
    assert blank.key == base.key  # still scored against canon Cersei (by key)
    assert blank.drive_params == base.drive_params  # still mechanically Cersei
    assert blank.voice_anchors == ()  # voice stripped
    assert blank.canon_exemplars == ()
    assert blank.reflection_rules == ()
    assert "no particular distinction" in blank.self_persona
    # Anonymized by default: the model cannot lean on the famous name.
    assert blank.name != base.name
    # Opting out keeps the real name.
    assert blank_genome("cersei", anonymize=False).name == base.name
