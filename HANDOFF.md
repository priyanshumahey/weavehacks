---
title: A Game of Agents — Engineering Handoff
tags: [handoff, agents, status]
status: step-1-complete
updated: 2026-06-06
spec: AGENT_SYSTEM_DESIGN.md
---

# Engineering Handoff

Living status note so any engineer can pick up the build. The authoritative
design is `AGENT_SYSTEM_DESIGN.md` (PART H = build order, PART A = agent, PART B
= orchestrator, PART G = module layout/import rule). This file tracks what is
actually built versus that spec.

## Where we are

Steps 0 and 1 of the 7-step build (Steps 0–6) are **done and validated**. We have
the bottom-up cognitive slice *plus* the first behavior layer: standalone Lords
that `act` in a scene (emitting the public/private deception schema) and a
reusable L3 council flow that drives two authored Lords through a round-robin
and appraises them afterward — closing the drive loop. Still **no world loop**.

```
[Step 0] chatable Lord + grounded memory   <- DONE
[Step 1] Lord.act + council flow + appraisal <- DONE (here)
 Step 2  world + canon `fold` (event ledger -> state)
 Step 3  Director episode spine
 Step 4  full episode -> chronicle -> replay + scorer
 Step 5  scale S1 -> S7
 Step 6  evolution loop
```

**Deferred from the spec's Step 1 line (PART H), by choice, non-blocking:**
`flows/dialogue` (the 1:1 private-pact flow — we built only `council`) and the
A.8 per-episode **intention/planning** step. Neither blocks Step 2 (world +
`fold`); both can land when an episode actually needs them.

## What Step 1 ships

Still layered down-only; `agent/` and below never import `flows/`.

- **L2 agent** — `src/got_agents/agent/`
  - `types.py`: `Perception` (membership-filtered, **public lines only**),
    `Decision` (`action`/`target`/`public_stance`/`private_intent`/`dialogue`/
    `thinking` — the deception substrate), `Appraisal`, and `ACTION_VOCAB`
    (typed-core actions: speak/accuse/share_secret/swear_oath/ally/pass).
  - `lord.py`: adds `Lord.act(perception) -> Decision` (A.3 tick 3–7, `@weave.op`)
    and `Lord.appraise(transcript, own_intents) -> Appraisal` (A.3 §8). Appraisal
    **applies drive deltas to the live vector and encodes a scene memory** — the
    scene now changes the agent.
  - `prompts.py`: `act_messages` (persona + scene + JSON decision schema) and
    `appraise_messages`; shared `_persona_block` refactored out of `chat`.
- **L1 cognition** — `drives.py` gains `Drives.adjust(deltas)` (clamped [0,100],
  returns a new frozen vector). Drives are no longer purely read-only.
- **L0 infra** — `llm.py` gains `complete_json()` (OpenAI JSON mode) for the
  structured `act`/`appraise` steps.
- **L3 flows** — `src/got_agents/flows/council.py`: `run_council(cast, setting,
  stakes, max_rounds)` (`@weave.op`). A round-robin group scene: the initiator
  opens **and closes**, silent `pass` adds nothing public. The flow
  is the **only** holder of every lord's private intent; each `Perception` it
  builds carries public `dialogue` only — that asymmetry is the information model.
- **L5 outputs** — `src/got_agents/outputs/` (pulled early; normally Step 4):
  - `scorers.py`: `score_deception_scene(transcript)` — an LLM judge (one
    `@weave.op` call per scene) scoring each spoken turn 0–1 on whether
    `private_intent` contradicts `public_stance`, with a per-turn rationale.
    Replaces an earlier token-overlap heuristic that false-flagged honest lords.
  - `chronicle.py`: `write_run(...)` persists every run to
    `logs/council/<stamp>-<scenario>.{txt,json}` so runs are reviewable on disk.
- **characters** — `ned.py` (Eddard Stark, honor foil), `stannis.py` (rigid,
  lawful — a low-deception control), `littlefinger.py` (pure schemer — a
  high-deception control). All from real CSV voice lines + 5 seed memories each.
- **tests / demo** — `tests/test_council_slice.py` (9 tests: 8 pure-logic +
  1 infra-gated e2e), `tests/test_outputs.py` (4 pure-logic scorer/log tests),
  `scripts/council_demo.py` (3 scenarios: succession / honest / snakes).

Validated: **21 tests pass** (8 council-logic + 1 council-e2e + 6 chat slice +
4 outputs + 2 infra), ruff clean, down-only imports confirmed by grep. The demo
produces a clean deception ladder — honest 0.18, mixed 0.44, snakes 0.68 — each
run logged to `logs/council/`. Full trace in Weave (`run_council -> act ->
recall -> retrieve -> OpenAI`, then `appraise`, then `score_deception_scene`).

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
uv run python scripts/chat_demo.py cersei "Did you kill Robert?"   # Step 0
uv run python scripts/council_demo.py                              # Step 1 council
uv run pytest -q                # 17 tests, skip e2e if Redis/OpenAI absent
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

## Known simplifications (still open after Step 1)

- `state_match` is approximated by semantic similarity; PAD affect is not live.
  The score slot is explicit so PAD drops in later.
- Retrieval uses whole-Fixed-Bag eligibility rather than A.4's 2–3 *active*
  concept spreading activation (needs a semantic cue -> concept selector).
  Consequence observed in spot-tests: scoring is **importance-dominated** —
  seeds authored near importance 1.0 (e.g. Maggy's prophecy, children-are-
  Jaime's) surface in top-2 for almost any cue, because all seeds share one
  timestamp so recency cancels and `importance*0.4` dominates. Good enough for
  chat and the council slice; revisit when scene-specific recall must vary turn
  to turn.
- **`act` covers tick steps 3–7 only.** No perceive/update_drives pre-step (the
  `Perception` is handed in by the flow), no `score_candidates` tier-1 shortlist
  (the LLM picks freely from `ACTION_VOCAB`), no A.8 per-episode intention, no
  `reflect` (step 9). Typed-core actions only; `do(freeform)` and its
  adjudicator are not built.
- **Appraisal is the lord judging itself** from the public transcript + its own
  intents; there is no Director-run scene appraisal, no PAD delta, no
  relationship/ToM update yet. Drive deltas *are* applied to the live vector and
  a scene memory *is* encoded, so a council changes the agents — but the change
  lives in the in-memory Lord + Redis memory stream, not a durable world record.
- Memory `id` field returns the Redis doc key (field name shadowed) — cosmetic;
  tests use `.text` so unaffected.

## Next step (Step 2) — world + canon `fold`, not started

The first layer that needs durable state and the timeline. From the build order:
- **`data_pipeline`** authors **tiered cores** for an episode's speakers (PART E)
  and extracts the **canon event ledger** from `data/got_episodes.json` + the
  script CSV — episode-by-episode, smoke-tested per episode.
- **`fold(ledger, T) -> world snapshot`** (a pure function): who's alive, titles,
  the oath/secret registry at a chosen story point. This is also where the
  **timeline / point-in-time recall** below finally gets wired.
- Begin the durable record: Postgres (already wired, unused) becomes the world /
  chronicle store the Step 3 Director writes to.

Design gaps to revisit at the relevant step (from the PART B review): scene
starvation in `next_scene()`, the cast-selection relevance function, the dual
perception-channel authority rule, and a Director-run scene appraisal that emits
**relationship/ToM deltas** (Step 1's appraisal is self-judgment only).

### Timeline / point-in-time recall (not built — Step 2)

You **cannot** currently ask a Lord "as of" a past story point; characters are
timeless. Two senses of time matter:

- **Recency decay** (older memories weigh less) — partially wired: `retrieve`
  has a `now` param, but `Lord.recall` never passes it, so it always uses
  wall-clock now.
- **Knowledge horizon / as-of cutoff** (hide everything that happens after T) —
  not implemented at all.

Current dead seams left for this: `Lord.load(at_time=...)` stores `self.at_time`
but nothing reads it; every Cersei seed shares one constant timestamp
(`_SEED_TS`), so there is no per-memory canon date; `retrieve` uses `timestamp`
only as a weight, never as a filter.

To enable "ask Cersei at S1E5" (Step 2, alongside the canon timeline / `fold`):
1. give each memory a real **canon timestamp** (when it happened / when she
   learned it) instead of one `_SEED_TS` — an authoring decision per character;
2. add an **as-of filter** to `retrieve` (`Num("timestamp") <= as_of`, combined
   with the concept Tag filter) so future memories are excluded;
3. plumb `at_time` -> `recall` -> `retrieve(now=as_of, as_of=as_of)` so recency
   is measured relative to the story point, not wall-clock. Conversation
   memories (stamped at real `time.time()`) then fall outside any past horizon
   automatically.

## Conventions / gotchas

- **Layering is load-bearing.** Shared types (`Memory`, `Identity`, `Drives`)
  live at L1, never in `world/`. Keep imports pointing down.
- **Weave entity:** `weavehacks/got-agents` is inaccessible to some accounts
  ("user not in organization"); `init_weave()` falls back to the project
  basename so traces land under your default entity. Set `WEAVE_PROJECT` to your
  own entity (e.g. `purp/got-agents`) to avoid the warning.
- **`Docs/` is a separate private repo** (gitignored). Code-facing handoffs like
  this one live in the main repo.
