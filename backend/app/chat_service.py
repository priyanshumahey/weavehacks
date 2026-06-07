"""Chat service — bridges the FastAPI app to the ``got_agents`` Lord.

A character is loaded **as of a story point** (``Lord.load(key, at_time)``), so
the conversation reflects only what that character knew by that episode — the
"rewind to S1E5 and talk to Cersei" mechanic. Lords are cached per
(character, episode); conversation history is kept in-process per session and
replayed so a chat has continuity without polluting canonical Redis memory.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass

from got_agents.agent import prompts
from got_agents.agent.lord import Lord
from got_agents.characters import charset_for, get_character, known

# Season-1 episode rewind points (per-episode resolution).
EPISODES: list[str] = [f"s1e{e}" for e in range(1, 11)]
DEFAULT_EPISODE = "s1e1"

_lock = threading.Lock()
# (character, episode) -> Lord
_lords: dict[tuple[str, str], Lord] = {}
# session_id -> list[(speaker, text)]
_histories: dict[str, list[tuple[str, str]]] = {}
# session_id -> last computed inner state (for the CopilotKit inspector panel)
_inner_state: dict[str, dict] = {}
_MAX_HISTORY = 16


def list_characters() -> list[dict]:
    """All chat-ready characters with display metadata."""
    out: list[dict] = []
    for key in known():
        genome = get_character(key).genome
        out.append(
            {
                "key": key,
                "name": genome.name,
                "title": genome.title,
                "persona": genome.self_persona,
                "lifeMotive": genome.life_motive,
                "charset": charset_for(key) or key,
                "topDrives": [
                    {"name": n, "value": v}
                    for n, v in sorted(
                        genome.drive_params.items(), key=lambda kv: kv[1], reverse=True
                    )[:3]
                ],
            }
        )
    return out


def episodes() -> list[dict]:
    return [{"id": ep, "label": ep.upper().replace("E", " · E")} for ep in EPISODES]


def _get_lord(character: str, episode: str) -> Lord:
    key = (character, episode)
    with _lock:
        lord = _lords.get(key)
        if lord is None:
            lord = Lord.load(character, at_time=episode)
            _lords[key] = lord
        return lord


def reset_session(session_id: str) -> None:
    with _lock:
        _histories.pop(session_id, None)


def chat(
    character: str,
    message: str,
    *,
    episode: str = DEFAULT_EPISODE,
    session_id: str = "default",
) -> dict:
    """Run one chat turn; return the reply plus the character's inner state."""
    get_character(character)  # validates key (raises KeyError)
    if episode not in EPISODES:
        episode = DEFAULT_EPISODE
    lord = _get_lord(character, episode)

    # The memories this character draws on this turn (for the inspector panel).
    retrieved = lord.recall(message)

    # Replay prior turns of THIS session so the conversation is multi-turn,
    # without polluting canonical Redis memory.
    history = _histories.setdefault(session_id, [])
    reply = lord.chat(message, history=list(history))

    history.append(("you", message))
    history.append((character, reply))
    del history[:-_MAX_HISTORY]

    return {
        "character": {"key": character, "name": lord.genome.name},
        "episode": episode,
        "reply": reply,
        "drives": {
            "felt": lord.drives.felt(3),
            "top": [{"name": n, "value": v} for n, v in lord.drives.top(3)],
        },
        "recalledMemories": [
            {"text": m.text, "importance": m.importance, "concepts": list(m.concepts)}
            for m in retrieved
        ],
        "memoryCount": lord.memory.count(),
    }


def _inner_state_payload(lord: Lord, retrieved) -> dict:
    return {
        "felt": lord.drives.felt(3),
        "drives": [{"name": n, "value": v} for n, v in lord.drives.top(8)],
        "recalledMemories": [
            {"text": m.text, "importance": m.importance, "concepts": list(m.concepts)}
            for m in retrieved
        ],
        "memoryCount": lord.memory.count(),
    }


def prepare(
    character: str,
    message: str,
    *,
    episode: str = DEFAULT_EPISODE,
    session_id: str = "default",
    play_as: str | None = None,
) -> dict:
    """Build the grounded system prompt for a turn (used by the CopilotKit runtime).

    The Node runtime streams the reply itself, so here we only assemble the
    system prompt (persona + story-point horizon + recalled memories) and stash
    the character's inner state so the inspector panel can read it back.
    """
    get_character(character)
    if episode not in EPISODES:
        episode = DEFAULT_EPISODE
    lord = _get_lord(character, episode)
    retrieved = lord.recall(message)

    system = prompts.system_prompt(
        lord.identity, lord.drives, retrieved, at_time=episode
    )

    if play_as:
        try:
            speaker = get_character(play_as).genome
            title = f", {speaker.title}" if speaker.title else ""
            system += (
                f"\n\nThe person addressing you is {speaker.name}{title}. They "
                "speak to you in the first person as themselves; treat their words "
                "as that person's and respond to them accordingly, mindful of where "
                "you each stand."
            )
        except KeyError:
            pass

    state = _inner_state_payload(lord, retrieved)
    with _lock:
        _inner_state[session_id] = state

    return {
        "character": {"key": character, "name": lord.genome.name},
        "episode": episode,
        "system": system,
        **state,
    }


def inner_state(session_id: str) -> dict | None:
    with _lock:
        return _inner_state.get(session_id)


@dataclass(frozen=True, slots=True)
class ChatSummary:
    character: str
    episode: str
