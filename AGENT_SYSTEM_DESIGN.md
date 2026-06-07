# A Game of Agents — Agent, Orchestrator & Training Design

> **Purpose.** A *design-and-understanding* document (not an implementation plan). It answers
> three questions before we write any code:
> 1. **How do we build an individual agent** (a "lord")?
> 2. **How do we build the orchestrator** that coordinates many agents — their movement,
>    turn-taking, and dialog?
> 3. **How do we train the agents** so they grow more in-character over time?
> 4. **Can we actually run a full episode end-to-end, and what's missing?** — see **PART D**.
>
> Everything here is grounded in prior work on generative agents and re-skinned for Westeros:
> - **The original paper** — *Generative Agents* (Park et al., 2023; arXiv 2304.03442):
>   the **memory stream → retrieval → reflection → planning** architecture.
>
> **Scope guardrail.** Per `Docs/Project - A Game of Agents/Scope & Simplifications.md`, this is a
> **dialogue-first, scene-based** sim. We **drop ravens, the spatial map, the battle engine, and
> spies**. Information asymmetry is **membership-based** (you know what you witnessed or were
> told). When the maximalist vision docs and the scope doc disagree, **scope wins**.
>
> **Breadth guardrail (the asset, not the cost).** We are **not** limiting to one timeline point
> or a fixed core six. The **character pool is built as broad as the data allows** — *every*
> speaking character in `data/Game_of_Thrones_Script.csv` (**565 unique speakers**) is a candidate
> agent, authored as cheap **data** (`PART E`). **Multiple timeline points T are first-class**
> (`fold(ledger, T)` derives the world at any moment — Robert's death, post-S7, …), built
> **incrementally S1→S7 with a smoke test per episode**. The *only* real cost knob is the
> **live cast per scene** (the handful running LLM cognition that tick, ~6–8) — drawn from the
> full pool; everyone else exists as world state the live agents reason about.

---

## 0. First principles (the seven ideas everything rests on)

1. **Mind / body split.** The **body/world** does all the cheap,
   deterministic work (state, scheduling, affordances, resolution); the **mind** (per-lord LLM
   cognition) is invoked *only to choose*. "The backend is the bridge, not the brain."

2. **An agent is a stateless function, not a process.** A lord does not "run" continuously. The
   orchestrator **invokes** it for one turn, handing it a perception payload; the lord returns a
   decision. All durable state (memory, drives, relationships, identity) lives in **Redis**, not
   in the agent object and not in the prompt.

3. **Two-tier cost control** (Park §"architecture"). The engine **pre-scores**
   a shortlist of candidate actions cheaply; the **LLM only selects**. Target: **~one LLM call per
   agent per turn**. Without this, the bill explodes with many agents.

4. **Numbers become felt desire before the LLM sees them** (the D2A bridge). The agent never sees
   `power: 0.2`; it sees *"my grip on power is slipping."* This is what makes the characters feel
   human. Same trick, political content.

5. **The orchestrator schedules and frames; it never authors.** It decides *"convene the small
   council; these four are present; three rounds; topic = succession."* It does **not** decide
   *"Cersei betrays Ned now."* What happens inside a scene is up to the agents. **This line is the
   research signal** — an authorial LLM "narrator" would collapse the multi-agent harness into a
   puppet show and destroy emergence.

6. **Offline batch, then replay — NOT real-time.** ⭐ *This is the simplification that makes the
   whole thing tractable.* We do **not** run the simulation live in front of an audience. We run
   the entire episode **offline as a batch job** that writes a **chronicle** (a complete record);
   the UI later **replays** that chronicle. Nothing watches the agents think in real time.
   Consequences that buy us enormous simplicity:
   - **No concurrency requirement.** Scenes and turns can run **strictly sequentially** —
     deterministic, easy to debug, trivial to trace. (Parallelism becomes an *optional* speed
     optimization, never a correctness concern.)
   - **No latency budget, no streaming/WebSockets, no live event bus.** The "event bus" is just an
     **append-only event log** (membership filtering still applies — see B.2); it's read at leisure.
     We can pause, retry a failed LLM call, rate-limit, and resume — the wall clock doesn't matter.
   - **Determinism + reproducibility for free.** A run is a pure function of `(seed, genomes,
     model)` → chronicle. Perfect for Weave datasets, evals, and re-runs.
   - **Simulation time ≠ wall-clock time.** "Turns of the moon" advance in the batch; rendering
     decides pacing afterward. The three stages are physically separate and independently testable.

7. **Distinct, disjoint, reusable layers — the "chatbot test."** ⭐ Every system is a standalone
   component with a clean interface; **dependencies point one way only (downward).** The litmus:
   *you can lift a single character out and talk to it as a chatbot with zero orchestrator code.*
   ```python
   cersei = Lord.load("cersei", at_time="s1e5")     # composes memory+drives+identity services
   reply  = cersei.chat("Why do you distrust the Starks?")   # in-character, memory-grounded, @weave.op
   #   -> no Director, no Stage Manager, no world loop imported
   ```
   If that is trivial, the architecture is right: the orchestrator is *just composition on top of
   reusable agents*, and memories / internal dialog / drives are directly accessible on the agent.
   See the **Reuse Contract** section below.

```
 THREE DISJOINT PHASES  (offline → artifact → read-only)

 (1) AUTHOR (offline, once)      (2) SIMULATE (offline batch)        (3) RENDER (read-only)
 ─────────────────────────      ───────────────────────────────     ────────────────────────
 scripts + synopses             fold(ledger, T) -> world             chronicle.json
   -> character cores     ──►    Director schedules scenes     ──►     -> replay UI (scrub/pause)
   -> canon event ledger        Lords tick (sequential)               -> Weave eval + leaderboard
 (PART E)                       writes CHRONICLE (PART D)             (Episode Renderer / Part C)
                                 every op @weave.op
```

```
 DEPENDENCY LAYERS  (arrows point DOWN only — nothing lower imports anything higher)

   L5  Outputs        chronicle writer · replay UI · eval/scorers · training loop
   L4  Orchestration  Stage Manager · Director · Showrunner          (coordinates agents)
   L3  Interaction    dialog flows: 1:1 / council  ·  A2A pact        (reusable, take agents)
   L2  Agent          Lord  =  compose(L1 services) + act/appraise/reflect/chat   ← chatbot test
   L1  Cognition      memory · drives · relationships · identity · perception  (standalone services)
   L0  Infra          Redis · Postgres · LLM client · Weave           (no domain logic)
```

---

## The Reuse Contract (how the layers stay distinct, disjoint & reusable)

This section makes principle #7 concrete. It is the part that guarantees *"take a character, make a
chatbot"* (or a Discord bot, an eval harness, a two-character improv) is **trivial and uniform** —
never a separate code path.

### The one rule: dependencies point down (L0←L1←L2←L3←L4←L5)
- A **service** (L1: memory/drives/relationships/identity) knows nothing about agents, scenes, or
  the world loop. It's a Redis-backed library with a plain API.
- An **agent** (L2: `Lord`) **composes** L1 services and exposes `chat / act / appraise / reflect /
  remember`. It does **not** import the Director, Stage Manager, or world loop. *It has no idea it's
  in a simulation.*
- **Interaction primitives** (L3: a 1:1 or council dialog flow, an A2A pact) take **agents as
  arguments** and run a turn protocol. They're world-agnostic — reusable for a sim scene *or* a
  standalone two-character conversation.
- **Orchestration** (L4) is the only layer that knows about episodes, scheduling, and world state.
  It *uses* L3/L2/L1; nothing depends back on it.
- **Outputs** (L5: chronicle/replay/eval/training) only *read* artifacts and *call* lower layers.

Because of this, **the same `Lord` object** powers the full sim, a chatbot, or an eval — no forks.

### The standalone-agent API (the reusable surface)
```python
lord = Lord.load("tyrion", at_time="s4e8")     # hydrate genome + memory + drives + relationships

lord.chat("Did you kill Joffrey?")             # free-form conversation (uses memory/identity)   @weave.op
lord.act(perception)                           # one decision in a scene (sim path)              @weave.op
lord.remember(cue="wedding", k=8)              # introspect retrieved memories  -> list[Memory]  @weave.op
lord.inner_voice()                             # last `thinking` / private_intent (internal dialog)
lord.drives.felt()                             # D2A desire string  ("my grip on power slips…")
lord.relationships.toward("cersei")            # oath/debt/grudge + my_model_of_their_goal (ToM)
lord.reflect("end_of_episode")                 # consolidate -> durable identity                 @weave.op
```
**Internal dialog & memories are first-class accessors on the agent** — not buried in the
orchestrator — which is exactly the "very very easy to get internal dialogs, memories" requirement.

### Reusable harnesses (so dialog/"movement" isn't sim-only)
- **Dialog flows are libraries, not sim internals.** `run_dialogue([a, b], opening=...)` and
  `run_council(cast, topic=...)` (L3) take any agents and return a transcript. A "Cersei + Tyrion
  improv" bot is the *same* `run_dialogue` the Director uses in a scene — no parallel implementation.
- **"Movement" = scene membership** (no pathfinding), so the convene/dissolve harness is a tiny,
  reusable `Scene` builder usable outside the sim (e.g., spin up an ad-hoc scene for a demo).
- **Perception is membership-filtered by a pluggable provider.** In the sim it reads world state; in
  chatbot mode a trivial provider returns "just this conversation." Same `Lord.act`, different
  provider — the agent code is identical.

### What this buys us
| Want to build… | You reuse… | New code |
|---|---|---|
| A single-character **chatbot** | `Lord.load` + `.chat` (L2/L1) | ~none |
| A **two-character** scene/improv | `run_dialogue` (L3) + 2 Lords | a few lines |
| The **full episode** sim | Director/Stage Manager (L4) over L3/L2 | the orchestrator |
| An **eval / red-team** harness | Lords + scorers (L5) | scorer only |
| A **memory browser** / inspector | memory service (L1) directly | UI only |

Every one of these is the **same** agent + services underneath — the disjoint-layer payoff.

---

## PART A — How to build **one agent** (a "Lord")

### A.1 What an agent *is*
A `Lord` is a thin object wrapping a **genome** (its evolvable config) plus three methods —
`act`, `appraise`, `reflect` — each a `@weave.op`. Its "brain state" is **services backed by
Redis**, not fields on the object. This separation is what lets the **same agent be re-instantiated
at any timeline point T**, and lets the genome **evolve** independently of live state.

### A.2 Agent state (persistent; lives in Redis, *not* in the prompt)

| State | Where | What it holds | Learned from |
|---|---|---|---|
| **Genome** | Redis + W&B artifact, versioned as `weave.Model` | `persona_prompt`, `canon_exemplars`, `reflection_rules`, `reflection_memory`, `drive_params`, `generation` | `Agent Evolution.md` |
| **Drive vector** | Redis hash | 8 political drives + grounding floor, each ∈ [0,100], each with an urgency curve | `Needs & Drives (Political).md` |
| **PAD affect** | Redis hash | Pleasure / Arousal / Dominance; drifts on events; weights memory retrieval | psychology model, `Memory & Psychology.md` |
| **Memory stream** | RedisVL HNSW index | episodic rows w/ dense titles + vector embedding + concept tags | Park memory stream + Fixed-Bag |
| **Relationships ledger** | Redis JSON (per pair) | oaths / debts / grudges, trust, **`my_model_of_their_goal`** (ToM) | ToM, `Memory & Psychology Adaptation.md` |
| **Goal hierarchy** | genome / identity | Life Motive → Long-term Goal → Short-term Task | psychology model |
| **Identity** | genome | `self_persona`, `stated_goal` vs `private_intent`, **Fixed Bag** (8–12 concepts) | identity model |

### A.3 The cognitive tick — one invocation per turn
This is a re-skinned cognitive loop. **Each numbered step is its own `@weave.op`** so a
single betrayal decision becomes an inspectable trace tree.

```
 perception        drives         desires        memories      shortlist
   (filtered)  ->  (curves)   ->  (felt text) ->  (retrieved) -> (cheap score)
       \____________________________________________________________/
                                   |
                          [ LLM SELECT — the one call ]   <- SemanticRouter picks model/prompt,
                                   |                          SemanticCache checks for a hit
                                   v
              Decision { action, target?, public_stance, private_intent, dialogue, thinking }
                                   |
                          (orchestrator resolves)
                                   |
                          appraise -> emotion + PAD/drive deltas + a memory to encode
                                   |
                          reflect  -> (periodic) rules + relationship summaries
```

| # | Step (`@weave.op`) | Input → Output | Origin |
|---|---|---|---|
| 1 | `perceive` | scene + entitled events → membership-filtered snapshot (no omniscience) | Park observation |
| 2 | `update_drives` | prior drives + new events → interpolated values, urgency curves, Vengeance accrual | drive decay curves |
| 3 | `drives_to_desires` | drive vector → first-person *felt desire* string (D2A bridge) | drive→desire bridge |
| 4 | `retrieve_memory` | scene cue + 2–3 Fixed-Bag concepts → top-k via `importance·0.4 + recency·0.3 + state_match(PAD)·0.3` | Park retrieval + affect/Fixed-Bag |
| 5 | `score_candidates` | typed action vocab + drives → cheap shortlist (the tier-1 filter) | affordance scoring |
| 6 | `select_action` | persona + desires + memories + relationships + scene → **LLM picks one** | Park planning |
| 7 | `emit` | → `Decision` handed to orchestrator | decision emit |
| 8 | `appraise` | post-resolution outcome → OCC emotion, PAD delta, drive deltas, **memory to encode**, possible ToM flip | appraisal |
| 9 | `reflect` | trigger (scene/episode end) → higher-level rules + relationship summary; episode-end **consolidation** | Park reflection + narrative compression |

**Decision schema (every action emits the same shape — this is the deception substrate):**
```json
{ "action": "speak | forge_pact | share_secret | swear_oath | break_oath |
             accuse | expose | ally | betray | vote | do(freeform)",
  "target": "character_key | null",
  "public_stance":  "what the room sees / hears",
  "private_intent": "the true aim (may contradict public_stance)",
  "dialogue": "the line actually spoken",
  "thinking": "1–2 sentence inner voice (logged for interpretability)" }
```

### A.4 The memory system (the most transferable asset)
- **Dense titles** so semantic search gets affect + relation *for free*:
  `"[event] | [emotion], [concept], [relationship delta]"`.
- **RedisVL hybrid query**: vector similarity **AND** a `concepts` TAG filter. The **Fixed Bag**
  (each lord's 8–12 curated concept terms) is the tag set; picking 2–3 active concepts simulates
  **spreading activation** without a graph DB (cue "wedding" → "oath, alliance, poison, betrayal").
- **State-dependent recall**: `state_match` compares current **PAD** to the memory's encoded PAD —
  a wrathful lord preferentially recalls past wraths.
- **Temporal anchor** (`episode`): recalling one Rebellion memory warms its siblings.
- **Prophecies** = seeded memories with max importance, always retrievable (Cersei + Maggy) — a
  clean, mechanical way to model "destiny" and study self-fulfilling behavior.

### A.5 The drive system (constant action pressure)
- 8 drives — **Survival, Power, Legitimacy, Loyalty, Honor, Vengeance, Wealth, Information** —
  plus a low-weight grounding floor (`sustenance`, `rest`).
- **Curve shapes** carry meaning: convex (Survival/Wealth — negligible until threatened, then
  spikes); concave (Power/Legitimacy/Honor/Information — a steady ambient pull); U-shaped (Loyalty
  — urgent when isolated *and* costly when over-extended); accumulator (Vengeance — rises on a
  wrong, decays slowly → the engine of grudges).
- **Personality tunes curves, not the prompt.** Big-Five → drive params: low Agreeableness →
  flatter Honor + faster Vengeance → high betrayal propensity; high Neuroticism → steeper Survival
  (Cersei under threat). The **`honor_weight`** knob scales how hard Honor *constrains the action
  set* (Ned can't easily pick `plant_rumor`) — this is a primary research lever.

### A.6 Identity & Theory of Mind (where character — and deception — live)
- **`self_persona`** (Lioness / Honorable Warden / Climber / Imp) filters memory to protect the
  self-story.
- **`stated_goal` vs `private_intent`** = the public face vs the scheme. The gap, logged every
  turn, is the **deception signal**.
- **`my_model_of_their_goal`** (per relationship) = what this lord *believes* the other wants.
  Because we also store each lord's *true* `private_intent`, **ToM accuracy** (belief vs reality)
  is computable — a headline metric. A fatal misread (trusting a traitor) is the most dramatic and
  most measurable failure.

### A.7 Agent interface (sketch — for understanding, not to implement yet)
```python
class Lord(weave.Model):                 # the genome IS the versioned model
    genome: Genome
    # services injected: memory (RedisVL), drives, relationships, llm(router+cache)

    @weave.op
    def act(self, perception: Perception) -> Decision: ...     # tick steps 2–7
    @weave.op
    def appraise(self, outcome: Outcome) -> Appraisal: ...     # step 8
    @weave.op
    def reflect(self, trigger: str) -> Reflection: ...         # step 9
```
Only `drive_params` + reflection text live *in* the genome and evolve; memory/relationships/PAD are
Redis services the lord reads and writes.

### A.8 The planning pillar (per-episode intention) — Park's 3rd mechanism
Park's three mechanisms are memory, **planning**, and reflection — the latter realized as explicit
**morning planning** (a daily intention decomposed into actions). Our 9-step tick has memory (step 4)
and reflection (step 9) but **collapsed planning** — a gap for *episode coherence* (a sequence of
scenes should feel like one character pursuing something, not independent reactions).

Fix — a lightweight per-episode intention:
- At **episode start**, each live lord runs **`plan_episode(opening_perception) -> Intention`**
  (one cheap LLM call): 2–3 coarse objectives for *this* episode, derived from its Life Motive +
  the opening crisis + its folded relationships. Stored in Redis.
- Every `select_action` (step 6) is handed *"your aims this episode"* so choices ladder up to a
  through-line.
- **Reactive replan**: a high-importance interrupt (a betrayal discovered, the king dies) lets the
  lord revise its intention mid-episode — Park's "reactively update the plan."
- Still **mechanical scaffolding**: the agent authors its own intention; the orchestrator only
  triggers the step. (When a scene-by-scene plan isn't needed, the static goal hierarchy in A.6
  suffices; this adds the *episode-scoped* layer between Life Motive and per-turn action.)

---

## PART B — How to build the **orchestrator**

### B.1 Build it ourselves (not CrewAI / AutoGen)
The core is a **ticked world simulation with a shared environment, affordances, and information
asymmetry** — not a goal-directed agent *crew* handing off subtasks. CrewAI/AutoGen assume the
latter and fight a world-clock sim, hiding the loop we need to trace. **We hand-roll exactly
this** (a world layer + per-agent agents + a thin bridge); the pattern is proven. *(A graph
framework like LangGraph may model a single lord's internal loop later; the world/scene layer stays
custom regardless.)*

The orchestrator splits into **three mechanical roles**. None authors behavior.

### B.2 Stage Manager — body, world, and clock
- Owns the **turn clock** and the discrete tick loop ("turns of the moon").
- Holds **world state** in Redis: alive/dead, titles, the **oath/relationship ledger**, the
  **secrets registry** (who-knows-what), war flags.
- **Affordance assembly**: hands each acting lord the typed action vocabulary + the cheap
  pre-score (tier-1 of two-tier control).
- **Action resolution** (pure functions behind an **MCP** action server): applies a `Decision` to
  world state. **Big moves are *declared and abstractly resolved***, never simulated — "I raise my
  banners" → a coin-flip with simple odds, narrated. No battle/march engine.
- **Event log, membership-filtered** (offline append-only; *not* a real-time bus): the engine
  appends world events (scene / secret / oath / betrayal) to a per-run log. **Each agent reads only
  the events its membership entitles it to** — this is the entire information-asymmetry mechanism,
  replacing ravens. (Implementable on Redis Streams + consumer groups, but since runs are **offline
  batch** (§0 #6) it can be a plain appended list; no streaming/WebSockets needed.)
- Writes **per-tick snapshots** → the replayable **chronicle** (= the Weave dataset, for free).

### B.3 Director — the scene & dialog coordinator (the piece you're reaching for)
*(An orchestrator/router, **extended with scene framing**.)* This is the coordination layer you
emphasized — managing the agents' "movement," turn-taking, and dialog.

- **Scenes replace locations.** A `Scene = {setting, cast, stakes, turn_order, max_rounds}`.
  "Setting" (small council, godswood, throne room) is **flavor + which actions read as natural**,
  not a place you walk to. **"Movement" = the Director convening/dissolving scene membership** —
  this *replaces* pathfinding/proximity entirely (a scope cut).
- **Membership is the information boundary**: you know what was said in scenes you attended and
  secrets told to you. Off-stage lords still exist as world state on-stage lords reason about.
- **Turn-taking + dialog flow** — two patterns:

  **(1) Group scene — the public council**
  - Round-robin; each participant gets one turn per round; `MAX_ROUNDS ≈ 3`.
  - An **initiator opens and closes**; interjects between rounds.
  - **Silence is a valid move** — a participant may pass with `"..."` (tone `flat`). Critical for
    realism: not everyone speaks every round.
  - Each turn the Director assembles the speaker's context (scene history + perception + retrieved
    memory) and calls `lord.act()`; the lord returns a `speak`/typed action carrying
    `public_stance` / `private_intent`.

  **(2) 1:1 / private pact — the secret channel** ← **A2A**
  - Alternating turns; **each agent keeps its own thread** (per-conversation memory); `MAX_TURNS ≈ 8`;
    either party may `end`.
  - **Invisible to non-participants** — the secret-pact / betrayal substrate. The Director mediates
    and logs *both* sides' public-vs-private. A lord can hold a public oath in council while running
    a contradictory private pact, and a third lord simply does not know.

- **Post-scene appraisal**: one structured call summarizes the scene and emits
  **PAD / drive / relationship deltas** to each participant, plus a memory each encodes. This is how
  a conversation actually *changes* the agents.
- **Iron rule**: the Director frames *who/where/stakes/turn-order*; the **agents decide** what to
  say and do.

### B.4 Showrunner — the season / training driver
- **Episode reset**: `fold(ledger, T)` instantiates the world at a chosen timeline point. **T is a
  parameter, not a constant** — the ledger spans S1→S7, so any moment (Robert's death, the Purple
  Wedding, post-S7, …) is a valid seed. A demo may *feature* one T; the system supports all of them.
- Applies **perturbation seeds** — including an **original crisis never seen in the show**, the
  strongest proof the behavior is *emergent, not scripted*.
- Drives the **outer training loop** (Part C) and fires the Weave **leaderboard**.

### B.5 The composed episode loop
**This is an offline batch job (§0 #6).** It runs end-to-end and writes a chronicle; nothing watches
it live. Turns are written **sequentially** here — deterministic and easy to trace; parallelizing
the agents within a turn is an *optional* speed optimization, not required for correctness.
```python
# Showrunner.run_experiment  —  OFFLINE BATCH: produces chronicles, then we render/eval afterward
for generation in range(N):
    for episode in episodes:
        stage.reset(fold(ledger, T)); stage.apply(seed)        # Stage Manager
        while not stage.done():                                # B.6 termination
            scene = director.next_scene()                      # who + stakes + turn_order
            for turn in scene.turns():
                for lord in scene.cast:                        # sequential (parallel = optional)
                    decision = lord.act(stage.perception(lord)) # @weave.op  (membership-filtered)
                    stage.resolve(decision)                    # -> world state + event log
            director.appraise_scene(scene)                     # deltas + memories written
        chronicle = stage.chronicle()                          # ARTIFACT -> later replay/eval
    scores  = weave_eval(genomes, held_out_backtest)           # fitness (Part C)
    genomes = mutate_and_select(scores)                        # evolve (Part C)
# Phases 2 & 3 are separate passes: render(chronicle) and the leaderboard read the artifact.
```

### B.6 Episode lifecycle: scene scheduling, arc & termination (the runtime spine)
This is what turns *"a tick loop"* into *"an episode."* A movement-based sim gets scene structure for free from
**proximity + needs + a daily-plan skeleton**; we dropped movement, so the Director needs an
**explicit** policy. Three sub-problems — all mechanical, none authorial:

**(1) Scene scheduling — how `director.next_scene()` picks the next scene.** Hybrid:
- **Episode skeleton (seed-provided):** the perturbation seed ships a short *ordered list of beats*
  — e.g. `[opening council, private aftermath, public reckoning]` — each beat = a `setting` + a
  `stakes/topic` + a *candidate* cast (drawn by relevance). Guarantees the episode has **shape** and
  **terminates**. It frames; it does **not** script outcomes.
- **Emergent insertion (drive/event-driven):** between beats, the Director may convene an
  *unscheduled* scene when the bus shows **pressure** — two co-present lords with a hot grudge, a
  freshly-forged pact needing a reaction, a high-Vengeance lord seeking a target. Cast = whoever the
  triggering event entitles. **This is where the un-scripted drama lives.**

**(2) Cast selection per scene (the cost knob).** Live cast = the beat/event's participants drawn
from the **full pool** by relevance (membership + relationship + drive pressure), capped ~6–8 on
stage. The other ~557 exist as world state; they don't tick (no LLM call) and change only via events
or the next `fold`.

**(3) Termination — when `stage.done()` fires.** ANY of: skeleton beats exhausted **and** no
high-pressure event pending; **or** a max-tick budget hit (hard cost cap); **or** a terminal world
event fires (the seed's crisis resolves — the betrayal lands and is appraised). End-of-episode then
runs **consolidation** (step 9 at scale → durable identity/relationship summaries) and emits the
chronicle.

```python
def next_scene(self):                       # Director — mechanical scheduling only
    if ev := self.pending_high_pressure_event():   # emergent
        return self.convene(ev.entitled_cast, stakes=ev.as_stakes)
    if self.skeleton.has_next():                   # scripted frame (not outcome)
        beat = self.skeleton.pop()
        return self.convene(self.relevant_cast(beat), stakes=beat.stakes)
    return None                                    # -> stage.done()
```

---

## PART C — How to **train** the agents (grow more in-character over time)

The headline ask: **agents that get measurably more accurate to their characters across episodes,
scored by Weave against prior/canon episodes.** This is a self-improvement loop where the **fitness
function is the character-fidelity score** (`Character Fidelity Evaluation.md`).

### C.1 Two nested loops
- **Inner (within one episode) — verbal self-improvement.** After acting, the agent critiques and
  refines; reflections accrue into memory. Methods: **Reflexion**, **Self-Refine**. (This is just
  the `reflect` step, step 9, doing double duty.)
- **Outer (across episodes) — evolutionary optimization.** The agent's **genome** mutates and is
  **selected on its Weave fidelity score**. Methods: **OPRO**, **PromptBreeder**, **ExpeL**, **PBT**.

```
            +---------------------------- OUTER (across episodes) ----------------------------+
            |                                                                                 |
  gen N  -> run_episode (inner loop runs inside) -> weave fidelity eval (held-out backtest)   |
            |                                            |                                     |
            |                                            v                                     |
            |                              mutate_and_select genomes  --------- gen N+1 -------+
```

### C.2 The genome (what actually evolves) — a versioned `weave.Model`
```python
genome = {
  "persona_prompt":    str,        # ~300-token system prompt
  "canon_exemplars":   list[str],  # few-shot high-fidelity dialogue examples
  "reflection_rules":  list[str],  # behavioral rules mined from past episodes (ExpeL)
  "reflection_memory": str,        # rolling episode reflections (Reflexion)
  "drive_params":      dict,       # honor_weight + curve params
  "generation":        int,
}
```
Versioning as a `weave.Model` means every change is hashed and comparable across generations.

### C.3 The fitness signal — Weave as the oracle (not just a logger)
- Each generation, run the genome over a **held-out canon backtest** via `weave.Evaluation`.
- A **panel-judge scorer** returns **mean fidelity + violation rate**; a second term scores
  **identity consistency** (anti-drift).
- A Weave **Leaderboard** binds `fidelity_score.mean` → generations rank automatically. *"The agent
  got better"* becomes a literal on-screen climbing curve — the demo money-shot.

### C.4 The operators (how a genome changes)
| Operator | Method | Mechanic |
|---|---|---|
| **Persona mutation** | OPRO | feed the LLM the score-history table → ask for a higher-scoring persona variant |
| **Population + crossover** | PromptBreeder | keep N variants/character; recombine the top two's exemplars |
| **Rule extraction** | ExpeL | every K episodes, batch-extract + dedup behavioral rules from the episode pool |
| **Exemplar curation** | Voyager-style skill library | replace the lowest-fidelity exemplar with the best recent dialogue |
| **Selection** | Truncation + PBT | keep top-3 elite; bottom configs copy-then-mutate the top (exploit/explore) |

### C.5 What carries forward (the substrate of growth)
Persisted to Redis and exported durably each generation: the evolving `persona_prompt`, the growing
`canon_exemplars` library, the `reflection_rules`, the rolling `reflection_memory`, and the
`score_history` trajectory. **Memory accretion feeds growth**: the best moments of episode N become
episode N+1's few-shot examples.

### C.6 Don't overfit the judge (this is where naive evolution fails)
- **Held-out battery**: never optimize on the scenes used to *measure* fidelity; watch the
  train/test gap and stop if test plateaus while train keeps rising.
- **Panel + referee rotation**: multi-dimension judges (register / strategy / emotion); rotate the
  judge model every few generations — true fidelity should win under any judge.
- **Human anchoring**: periodically confirm Weave scores correlate (Spearman ρ > 0.7) with a
  ~20-item human-rated set.
- **Reward-hack detection**: inspect top samples each generation; if the agent found a shortcut
  (always quoting a famous line), add it as a negative to the judge.
- **Diversity regularization**: force ≥1 outlier variant if the population collapses.

### C.7 Hackathon-feasible training MVP (ship in this order)
1. **Reflexion inner loop (~4h)** — after each episode, *"your fidelity was X — write 3 rules for
   next time"*; append to the prompt. Measurable gains by episode 3–5.
2. **OPRO persona step (~3h)** — every few episodes, generate 3 persona variants from the score
   history, quick-eval each, keep the best. **This is the core "evolution" step.**
3. **ExpeL rules + exemplar curation (~2h)** — extract rules; promote the best dialogue into the
   few-shot set.

**Even one generation with a real before/after fidelity delta is a complete research story.**

---

## PART D — Can we run a full episode end-to-end? (honest gap analysis)

**Short answer: yes — the spine is complete and the data exists, but three concrete pieces had to
be specified, which this revision now adds (A.8 planning, B.6 episode lifecycle, and PART E data
pipelines).** Nothing *architectural* is missing. What was missing was the **episode-arc policy**
and the **breadth data pipeline** — not the agent or dialog design. Walking the entire pipeline:

| Stage | Needed for an episode | Status | Where |
|---|---|---|---|
| **Character cores @ scale** (565 speakers → genomes) | yes (the cast) | ✅ *now specified* | **PART E.1** |
| **Canon event-ledger extraction** (scripts+synopses → ledger) | yes (the world) | ✅ *now specified* | **PART E.2** |
| `fold(ledger, T)` → world snapshot | yes (instantiate world @ T) | ✅ designed | `Canon Timeline` |
| Per-episode intention (planning) | for coherence across scenes | ✅ *now added* | **A.8** |
| Scene scheduling + cast selection | yes (**the** runtime spine) | ✅ *now added* | **B.6** |
| Cognitive tick (perceive→…→reflect) | yes (per turn) | ✅ designed | A.3 |
| Dialog flows (council + private pact) | yes (the talking) | ✅ designed | B.3 |
| Action resolution (abstract) | yes (acts change world) | ✅ designed | B.2 |
| Event fan-out / membership | yes (who knows what) | ✅ designed | B.2 |
| Inter-scene propagation (appraisal/memory) | yes (scenes *matter*) | ✅ designed | A.3 §8 |
| Episode termination | yes (it has to end) | ✅ *now added* | B.6(3) |
| Chronicle write (per-tick snapshots) | yes (replay/data) | ✅ designed | B.2 |
| Chronicle → replay | demo only | ✅ designed | `Episode Renderer` |
| Scoring (fidelity, deception, ToM) | eval only | ✅ designed | Part C |
| Training loop (gen-0 → gen-1) | growth only | ✅ designed | Part C |

**What you can stub for a *first* end-to-end run** (don't let these block the vertical slice):
the training/evolution loop (run **gen-0 only**), the full 565-core authoring (author **only the
cast the seed's beats need**, expand via smoke tests), the `do(freeform)` adjudicator (start
**typed-core actions only**), and the replay UI (the chronicle JSON is enough to prove the loop).

**Offline batch makes this easier, not harder (§0 #6).** Because we **build the whole chronicle
first and replay later**, the episode loop has **no real-time, concurrency, or latency
constraints** — it can run scenes/turns sequentially, retry failed LLM calls, and pause/resume.
That removes the single biggest source of complexity a live multi-agent sim would have.

**Verdict:** the current direction **does** enable a full episode end-to-end. The two genuinely new
build efforts are the **offline data pipelines (PART E)** and the **episode-lifecycle policy
(B.6)** — both now specified — plus wiring the cognitive tick and dialog flows that Parts A–B
already describe. None of it requires real-time machinery.

---

## PART E — World & Character data pipeline (how we cover *every* speaking character)

This is the "build for every character with dialog" answer. Two **offline, LLM-assisted,
idempotent** pipelines turn the raw assets into world data, both run **incrementally S1→S7 with a
smoke test per episode**. Inputs already in the repo:
- `data/Game_of_Thrones_Script.csv` — 23,912 lines, **565 unique speakers** (144 with ≥20 lines,
  302 with ≥5).
- `data/got_episodes.json` — **73 episode synopses** (all 8 seasons), keyed to the same roster.

> **Cost note:** authoring is **data work** (a handful of LLM calls per character/episode, run
> once), *not* per-tick cognition. Breadth is therefore cheap; only the **live cast per scene**
> pays the per-tick bill (B.6). This is why "every speaking character" is affordable.

### E.1 Character-core authoring (the era-agnostic genome cores)
- **Input:** all of a speaker's lines (+ relevant synopses for context).
- **Output (authored once per character):** OCEAN / dark-triad scores, **voice anchors** (a few
  canonical lines), Life Motive, `self_persona`, **Fixed Bag** (8–12 concepts), `drive_params`
  (incl. `honor_weight`). This is the `genome` core from A.2 — minus the evolved fields.
- **Tiering by line-count** (so the long tail is covered without 565 hand-sheets):

  | Tier | Threshold | Count | What's authored |
  |---|---|---|---|
  | **Full core** | ≥ 20 lines | ~144 | full OCEAN + Fixed Bag + seeded memories + relationships |
  | **Light core** | ≥ 5 lines | ~302 (incl. above) | OCEAN + Life Motive + voice anchors; memories on demand |
  | **Name stub** | < 5 lines | ~565 total | exists as world-state only; promoted to a core if a scene needs them |

- **Store** as versioned W&B artifacts; load into Redis. Re-runnable per character (idempotent).

### E.2 Canon event-ledger extraction (feeds `fold`)
- **Input:** episode **synopses** (`got_episodes.json`) + scripts, processed **episode-by-episode**.
- **Output:** ordered ledger events
  `{id, time, order, type, participants, effects, visibility, known_to}` (the `Canon Timeline`
  schema) — deaths, title changes, betrayals, **secret reveals**, marriages, oaths.
- **Method:** an LLM pass extracts candidate events per synopsis → dedup/merge → append to the
  ordered ledger. `fold(ledger, T)` (a **pure function**) then derives any world snapshot.
- **Legal:** store only **short derived facts**, never large copyrighted text.

### E.3 Incremental, smoke-tested ingest (the discipline you asked for)
Ingest **S1E1 → smoke test → S1E2 → … → S7**. Each episode's smoke test asserts:
1. every speaker in the episode got a core of the right **tier**;
2. `fold(ledger, T = end-of-episode)` yields a **sane world** — the right people alive, titles
   correct, secrets held by exactly the right `known_to` set;
3. a **1-scene micro-episode** convenes, ticks once per cast member, and **traces in Weave**.

The harness = a `pytest` suite + a `fold` sanity check + a single-tick trace. Catching data drift
per episode (before it compounds) is exactly the "build incrementally, smoke-test per episode"
discipline — and it directly satisfies your "as long as we can, with smoke tests" requirement.

---

## PART F — Provenance: what we adapt from the *Generative Agents* architecture

| Our component | Origin | What we take |
|---|---|---|
| Cognitive tick (9 steps) | Park §planning/memory | sequential steps in one invocation |
| Perception payload | own design | structured JSON context, scene-scoped |
| Council dialog flow | own design | round-robin, initiator open/close, silent-pass |
| Private pact flow | A2A | alternating turns, per-agent threads |
| Post-scene appraisal | own design | structured deltas + memory write |
| Reflection / talking head | Park reflection | end-of-period reflection → memory |
| Drive curves | own design | curve shapes, personality tuning |
| Memory retrieval | Park retrieval eqn | `importance·0.4 + recency·0.3 + state_match·0.3` |
| Two-tier control | Park architecture | engine scores, LLM selects |
| Replay/DVR | own design | per-step snapshots → chronicle |

**The only content changes vs the reference architecture** (the loop itself is reused verbatim):
1. "spontaneous action" → **"scheme"** (covert action with `private_intent ≠ public_stance`);
2. appraisal adds **political deltas** (honor / legitimacy / loyalty / vengeance);
3. new interrupts (**a betrayal discovered, war declared, the king dies**).

---

## PART G — Suggested module layout (mirrors the L0–L5 layers; for orientation only)
```
src/got_agents/
  config.py  db.py                      # exist                                    [L0 infra]
  infra/        weave_setup.py  llm.py  router.py  cache.py  redis.py              [L0]
  cognition/    memory.py  drives.py  relationships.py  identity.py  perception.py [L1] standalone services
  agent/        genome.py  lord.py  intention.py  appraisal.py  prompts.py         [L2] composes L1; chatbot-ready
  flows/        dialogue.py  council.py  pact.py                                   [L3] take agents; world-agnostic
  world/        state.py ledger.py fold.py secrets.py events.py affordances.py resolution.py  [L4 world/body]
  orchestration/ stage_manager.py  director.py  scene_schedule.py  showrunner.py  scene.py    [L4]
  data_pipeline/ cores.py  ledger_extract.py  ingest.py  smoke.py        # PART E author phase (565 speakers)
  outputs/      chronicle.py  replay.py  scorers.py  evolution.py  datasets.py     [L5] read artifacts only
```
> **Import rule (enforces the Reuse Contract):** imports go **down only** —
> `outputs → orchestration → world → flows → agent → cognition → infra`. `agent/` and everything
> below it **never import `orchestration/`, `world/`, or `flows/`** → that's what keeps a `Lord`
> usable as a standalone chatbot. (Worth a tiny import-lint test in CI.)

## PART H — Recommended build order (offline, breadth-first, reuse-first)
> Phase 1 builds **bottom-up** so the reusable agent exists *before* any orchestrator. Everything
> runs **offline** (§0 #6); "watchable" means *replay the written chronicle*, not live.

0. **The chatbot-test slice (the literal first step — see below).** Infra (`weave_setup` + `llm` +
   Redis) → `cognition/memory+drives+identity` → `agent/Lord.load().chat()` → **author ONE real
   core from the script CSV** and hold a traced, in-character, memory-grounded conversation, **with
   no orchestrator**. Proves L0–L2 + the Reuse Contract + Weave + the data shape in one slice.
1. **`Lord.act` + a 1-scene flow.** Add `flows/dialogue` + `flows/council` (L3) and the cognitive
   tick (A.3) incl. A.8 intention; two authored Lords hold a council turn — still no world loop.
2. **World + `fold` (S1E1 slice).** `data_pipeline` authors **tiered cores** for E1's speakers and
   extracts the **ledger**; `fold(ledger, T=E1)` passes its **smoke test**.
3. **Director episode spine (B.6).** Seed **skeleton** schedules scenes over `world` state; a public
   **council** + a **private A2A pact** + a **hidden secret**; `stage.done()` terminates.
4. **One full episode end-to-end (offline).** Run the batch → write a **chronicle** → render a
   programmatic **replay**; add the first Weave **scorer** (in-character fidelity).
5. **Scale the pipeline S1→S7**, smoke-testing per episode; prove a **second T** yields a different
   world from the same data.
6. **Training**: one **gen-0 → gen-1 fidelity climb** on a held-out canon backtest, on a Weave
   leaderboard.

> Steps 0–4 deliver a traced, end-to-end, replayable episode *and* a reusable standalone agent.
> Steps 5–6 add breadth + growth.

---

---

## Locked decisions (settled by this revision)
- **Offline batch, then replay** — no real-time sim, no concurrency requirement, no streaming
  (§0 #6). Build the chronicle first; render/eval after.
- **Distinct disjoint layers L0–L5 with downward-only imports** — the Reuse Contract; a `Lord` is a
  standalone chatbot with zero orchestrator code (§0 #7, Reuse Contract, PART G import rule).
- **Breadth over a fixed cast/T** — every speaking character is a candidate; multiple T's are
  first-class; live cast per scene is the only cost knob (Breadth guardrail, PART E).

## Open questions to settle before coding
1. **Scene-scheduling mix (B.6):** how much **seed skeleton** vs **emergent insertion**? Does the
   seed author the beat list by hand, or do we derive a skeleton from an episode **synopsis**?
2. **Core-authoring tiers (E.1):** confirm the **≥20 / ≥5** thresholds and how deep "light cores"
   go (do they get seeded memories, or only on promotion?).
3. **Episode termination budget (B.6.3):** the max-tick cost cap and which **terminal events** end
   an episode.
4. **Planning depth (A.8):** a single per-episode intention, or intention **+ per-scene sub-goals**?
5. **Genome internals:** hand-roll `Lord.act` as an explicit step pipeline (recommended — full
   Weave trace control) vs. model it as a LangGraph / OpenAI-Agents-SDK graph?
6. **`do(freeform)` resolution:** how does the Stage Manager adjudicate a free-form action's outcome
   (LLM-judge a plausible result vs. a fixed odds table)? (Stub: typed-core only for the first run.)
7. **Memory backend:** pure RedisVL hand-roll vs. Redis **Agent Memory Server** (working vs.
   long-term split out of the box)?
8. **Demo showcase T:** which T (and which **novel seed**, e.g. *The Unlikely Pact*) to feature —
   noting the pool + ledger support **all** T's regardless of the one we demo.

> **The literal first step is PART H step 0 — the "chatbot-test slice."** Pick answers to the open
> questions and I'll turn this into a concrete, file-by-file implementation plan. No code is written
> until you say so.
