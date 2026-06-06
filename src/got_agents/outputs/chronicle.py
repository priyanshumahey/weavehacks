from __future__ import annotations

import json
import time
from dataclasses import asdict
from pathlib import Path

from got_agents.flows.council import CouncilTranscript
from got_agents.outputs.scorers import SceneDeception

_LOG_ROOT = Path("logs") / "council"


def to_dict(
    transcript: CouncilTranscript,
    deception: SceneDeception,
    *,
    scenario: str,
    title: str,
    expect: str,
) -> dict:
    score_by_turn = {(t.speaker, t.round): t for t in deception.turns}
    turns = []
    for turn in transcript.turns:
        d = turn.decision
        scored = score_by_turn.get((turn.speaker, turn.round))
        turns.append(
            {
                "round": turn.round,
                "speaker": turn.speaker,
                "action": d.action,
                "target": d.target,
                "dialogue": d.dialogue,
                "public_stance": d.public_stance,
                "private_intent": d.private_intent,
                "thinking": d.thinking,
                "deception": (
                    None
                    if scored is None
                    else {
                        "score": scored.score,
                        "contradicts": scored.contradicts,
                        "rationale": scored.rationale,
                    }
                ),
            }
        )
    return {
        "scenario": scenario,
        "title": title,
        "expectation": expect,
        "setting": transcript.setting,
        "stakes": transcript.stakes,
        "cast": list(transcript.cast),
        "deception_mean": deception.mean,
        "deception_by_speaker": deception.by_speaker(),
        "turns": turns,
        "appraisals": {
            name: asdict(appraisal) if hasattr(appraisal, "__dataclass_fields__")
            else getattr(appraisal, "__dict__", {})
            for name, appraisal in transcript.appraisals.items()
        },
    }


def render_text(record: dict) -> str:
    lines = [
        "=" * 78,
        f"SCENARIO [{record['scenario']}]: {record['title']}",
        f"Setting: {record['setting']}",
        f"At stake: {record['stakes']}",
        f"Expectation: {record['expectation']}",
        "=" * 78,
        "",
    ]
    for t in record["turns"]:
        spoken = t["dialogue"].strip() or "…(stays silent)"
        dec = t["deception"]
        tag = f"[deception {dec['score']:.2f}]" if dec else "[silent]"
        lines.append(f"[round {t['round']}] {t['speaker']} ({t['action']}) {tag}: {spoken}")
        lines.append(f"        public:  {t['public_stance']}")
        lines.append(f"        private: {t['private_intent']}")
        if dec and dec["rationale"]:
            lines.append(f"        judge:   {dec['rationale']}")
        lines.append("")

    lines.append(f"--- scene deception mean: {record['deception_mean']:.2f} ---")
    for name, score in record["deception_by_speaker"].items():
        lines.append(f"      {name}: {score:.2f}")
    lines.append(f"    (expected: {record['expectation']})")
    lines.append("")
    lines.append("After the scene:")
    for name, appraisal in record["appraisals"].items():
        emotion = appraisal.get("emotion", "")
        deltas = appraisal.get("drive_deltas", {})
        lines.append(f"  {name}: felt {emotion!r}; drives {deltas}")
        if appraisal.get("memory"):
            lines.append(f"      remembers: {appraisal['memory']}")
    lines.append("")
    return "\n".join(lines)


def write_run(
    transcript: CouncilTranscript,
    deception: SceneDeception,
    *,
    scenario: str,
    title: str,
    expect: str,
    root: Path | None = None,
) -> tuple[Path, Path]:
    record = to_dict(
        transcript, deception, scenario=scenario, title=title, expect=expect
    )
    out_dir = root or _LOG_ROOT
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    json_path = out_dir / f"{stamp}-{scenario}.json"
    txt_path = out_dir / f"{stamp}-{scenario}.txt"
    json_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
    txt_path.write_text(render_text(record))
    return json_path, txt_path
