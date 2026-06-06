"""Step-0 demo: hold a traced, in-character conversation with a Lord.

    uv run python scripts/chat_demo.py [character] [message]

Requires Redis up (./scripts/stack.sh up) and OPENAI_API_KEY set. The full call
tree (chat -> recall -> retrieve -> OpenAI) appears in Weave.
"""

from __future__ import annotations

import sys

from got_agents.agent import Lord
from got_agents.characters import known
from got_agents.infra import init_weave


def main(argv: list[str]) -> None:
    init_weave()
    key = argv[1] if len(argv) > 1 else "cersei"
    message = argv[2] if len(argv) > 2 else "Did you kill Robert?"

    lord = Lord.load(key)
    print(f"[{', '.join(known())}]  seeded memories: {lord.memory.count()}\n")
    print(f"You: {message}")
    print(f"{lord.genome.name}: {lord.chat(message)}")


if __name__ == "__main__":
    main(sys.argv)
