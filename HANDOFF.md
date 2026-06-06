---
title: A Game of Agents — Engineering Handoff
tags: [handoff, agents, status]
status: step-0-complete
updated: 2026-06-06
spec: AGENT_SYSTEM_DESIGN.md
---

# Engineering Handoff

Living status note so any engineer can pick up the build. The authoritative
design is `AGENT_SYSTEM_DESIGN.md` (PART H = build order, PART A = agent, PART B
= orchestrator, PART G = module layout/import rule). This file tracks what is
actually built versus that spec.

## Where we are

Step 0 of the 7-step build (Steps 0–6) is **done, validated, and pushed**. It is
the bottom-up cognitive slice: a single standalone, in-character `Lord` you can
chat with, whose replies are grounded in that character's own canon memory. No
orchestrator, scene, or world loop yet.

```
[Step 0] chatable Lord + grounded memory   <- DONE (here)
 Step 1  Lord.act + one scene/council flow
 Step 2  world + canon `fold` (event ledger -> state)
 Step 3  Director episode spine
 Step 4  full episode -> chronicle -> replay + scorer
 Step 5  scale S1 -> S7
 Step 6  evolution loop
```

## What Step 0 ships

Layered per the Reuse Contract; imports point DOWN only (L0 < L1 < L2), so a
`Lord` stays usable as a standalone chatbot.

- **L0 infra** — `src/got_agents/infra/`
  - `llm.py`: one OpenAI client. `complete()` (chat, `gpt-5.5`), `embed()`
    (`text-embedding-3-small`, 1536-d). Reuse this; do not re-instantiate.
  - `weave_setup.py`: `init_weave()` with an entity-fallback so traces always
    land (see Gotchas).
- **L1 cognition** — `src/got_agents/cognition/`
  - `identity.py`: `Identity` (name, persona, life-motive, voice anchors, Fixed
    Bag of concept tags).
  - `drives.py`: 8 political drives. **Read-only in Step 0** — `felt()` renders
    the top-3 into a first-person desire string. No satisfaction/decay yet.
  - `memory.py`: `MemoryStore`, a per-character RedisVL vector index.
    `retrieve()` is the A.4 hybrid query (see below).
- **L2 agent** — `src/got_agents/agent/`
  - `genome.py`: authored spec -> `Identity` + `Drives`.
  - `prompts.py`: composes identity + drives + recalled memories into messages.
  - `lord.py`: `Lord.load/recall/chat`. `chat` and `recall` are `@weave.op`.
- **characters** — `src/got_agents/characters/cersei.py`: the one authored core
  (persona, real voice lines from the script CSV, 10-concept Fixed Bag, drive
  levels, 5 concept-tagged seed memories).
- **tests / demo** — `tests/test_chat_slice.py` (8 tests), `scripts/chat_demo.py`.

## The key mechanism — A.4 hybrid retrieval

On each turn `MemoryStore.retrieve(cue, concepts=identity.fixed_bag)`:
1. embeds the cue and pulls ~20 vector-similar candidates;
2. **AND**-filters them to the character's Fixed-Bag concept tags (with an
   unfiltered fallback so recall never starves);
3. re-ranks by `importance*0.4 + recency*0.3 + state_match*0.3` and returns
   top-k.

`Lord.recall` passes the Fixed Bag, which excludes conversation memories (tagged
`conversation`, not in the bag) so an agent's own prior replies cannot bury
canon grounding.

## Run it

```bash
docker compose up -d            # Redis (and friends)
uv sync
uv run python scripts/chat_demo.py cersei "Did you kill Robert?"
uv run pytest -q                # 8 tests, skip if Redis/OpenAI absent
uv run ruff check .
```

Env (`.env`): `OPENAI_API_KEY`, `WANDB_API_KEY`, `WEAVE_PROJECT`, `REDIS_URL`.

## Validation status

End-to-end validated against the spec: down-only layering confirmed; demo gives
in-character, canon-grounded replies; Weave trace nests `chat -> recall ->
retrieve -> OpenAI`; 8 tests pass (6 slice + 2 infra pings); ruff clean. The one
substantive deviation found (retrieval ignored the Fixed Bag) was fixed — that
is the A.4 concept filter above.

Storage in use today: **Redis only** (RedisVL vector index, one per character).
Postgres is running and wired (`config.py`, `db.py`, `docker-compose.yml`) but
**not used by any agent code yet** — it is scaffolding for the Step 2 durable
world/chronicle record. `tests/test_infra.py` pings both.

## Known simplifications (intentional for Step 0)

- `state_match` is approximated by semantic similarity; PAD affect is not live.
  The score slot is explicit so PAD drops in later.
- Retrieval uses whole-Fixed-Bag eligibility rather than A.4's 2–3 *active*
  concept spreading activation (needs a semantic cue -> concept selector).
  Consequence observed in spot-tests: scoring is **importance-dominated** —
  seeds authored near importance 1.0 (e.g. Maggy's prophecy, children-are-
  Jaime's) surface in top-2 for almost any cue, because all seeds share one
  timestamp so recency cancels and `importance*0.4` dominates. Good enough for
  chat grounding; revisit before `Lord.act` needs scene-specific recall.
- `Drives` are read-only; the appraisal -> drive-delta loop arrives with the
  cognitive tick.
- Memory `id` field returns the Redis doc key (field name shadowed) — cosmetic;
  tests use `.text` so unaffected.

## Next step (Step 1) — proposed, not started

Add behavior on top of the chat surface:
- `Lord.act(scene_context) -> action/utterance` (PART A.6–A.8), including A.8
  per-episode intention.
- A minimal L3 flow: one dialogue/council scene driving 2–3 lords through a
  few turns, transcript captured.
- Begin closing the drive loop: a light appraisal that writes drive deltas after
  an action, so drives stop being static.

Design gaps to revisit at the relevant step (from the PART B review): drive ->
satisfaction loop closure, scene starvation in `next_scene()`, the
cast-selection relevance function, and the dual perception-channel authority
rule.

## Conventions / gotchas

- **Layering is load-bearing.** Shared types (`Memory`, `Identity`, `Drives`)
  live at L1, never in `world/`. Keep imports pointing down.
- **Weave entity:** `weavehacks/got-agents` is inaccessible to some accounts
  ("user not in organization"); `init_weave()` falls back to the project
  basename so traces land under your default entity. Set `WEAVE_PROJECT` to your
  own entity (e.g. `purp/got-agents`) to avoid the warning.
- **`Docs/` is a separate private repo** (gitignored). Code-facing handoffs like
  this one live in the main repo.
