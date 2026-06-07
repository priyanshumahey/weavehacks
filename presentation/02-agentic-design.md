# 02 · Agentic Design

> The agents, the harness that coordinates them, the memory system that gives them a past, and the episodic context that lets them be rewound to any point in the story.

## The agent: one Lord's cognitive loop

Each character is a `Lord` — a genome (who they are) plus a Redis memory stream (what they've lived) plus 8 political drives (what they want). One **turn** runs this loop, and every box is a traced `@weave.op`:

```mermaid
flowchart LR
    PERC[perceive the scene public lines only]
    RECALL[recall top k memories from Redis]
    DECIDE[decide action plus public stance plus private intent]
    ACT[emit decision dialogue plus target]
    APPR[appraise emotion plus drive deltas]
    REFL[reflect encode durable memory]
    PERC --> RECALL --> DECIDE --> ACT --> APPR --> REFL
    RECALL <-.->|vector search| REDIS[(Redis)]
    REFL -.encode.-> REDIS
    DECIDE -.llm.-> OPENAI[OpenAI]
```

**The deception substrate.** A `Decision` carries both a `public_stance` (what the lord shows the room) and a `private_intent` (what they actually mean). Peers only ever receive the public line. That single design choice is what makes lying, scheming, and betrayal *possible* — and measurable.

```mermaid
flowchart TB
    LORD[Lord decides]
    LORD --> PUB[public stance shown to everyone]
    LORD --> PRIV[private intent hidden]
    PUB --> ROOM[other lords perceive this]
    PRIV -.never leaves the agent.-> ROOM
    PRIV --> JUDGE[deception scorer can see the gap]
```

## The harness: how agents work together

The harness is **thin and mechanical** — it frames scenes (who is co-present, where, the stakes, the turn order) but never writes a character's lines. That line is what keeps the multi-agent dynamics emergent. Everything bottoms out in one primitive, `run_council`.

```mermaid
flowchart TB
    PREMISE[one dramatic premise]
    PREMISE --> SHOW[showrunner LLM plan scenes]
    SHOW --> H1[huddle 1 cast plus stakes]
    SHOW --> H2[huddle 2 cast plus stakes]
    SHOW --> H3[huddle 3 cast plus stakes]
    H1 --> C1[run_council concurrent]
    H2 --> C2[run_council concurrent]
    H3 --> C3[run_council concurrent]
    C1 --> STITCH[stitch into one chronicle]
    C2 --> STITCH
    C3 --> STITCH
```

### Three escalating modes (all reuse the council)

```mermaid
flowchart LR
    M1[mode 1 single scene one council]
    M2[mode 2 one moment many concurrent huddles]
    M3[mode 3 continuous episode threads over time state carried]
    M1 --> M2 --> M3
```

| Mode | Stages | State carried |
|---|---|---|
| **Single scene** | one council, hand-picked cast | no |
| **One moment** | a premise → several concurrent councils | no |
| **Continuous episode** | a timeline of threads; cast moves between locations; groups re-form from a digest of what just happened | **yes — memory, drives, shared world** |

In the continuous mode the cast literally **moves between map locations with motive** — someone exiled walks to the Wall, an ally crosses the room to join a plot — and each phase is re-planned from what just happened, so alliances converge and the wronged confront the wrongdoer. Betrayals **emerge** from accumulated state, not a script.

## The memory system

Memory is the heart of the project. Each character has a private **episodic memory stream** in a Redis vector index, scored by a psychology-grounded retrieval formula and gated by a knowledge horizon.

```mermaid
flowchart TB
    subgraph SOURCES what fills memory
        SEED[authored seed memories backstory]
        LEDGER[canon ledger events fanned in by membership]
        CHATMEM[live chat plus scene exchanges]
        REFLECT[end of episode reflections importance high]
    end
    SOURCES --> STORE[(Redis vector index one per character)]
    STORE --> RETRIEVE[hybrid retrieval]
    RETRIEVE --> SCORE[score equals importance 0.4 plus recency 0.3 plus similarity 0.3]
    SCORE --> TOPK[top k memories shape the next decision]
```

**Membership-based information asymmetry.** When canon events are fanned into memory, a *secret* (the queen's parentage) lands only in the streams of characters who actually knew it. Cersei remembers it; Ned does not. Knowledge spreads only by being witnessed or told — never by omniscience.

## Episodic context: the time machine

`Lord.load(key, at_time="s1e5")` rewinds a character to any episode. Two things happen:

```mermaid
flowchart LR
    LOAD[Lord.load key at_time episode]
    LOAD --> FOLD[fold canon ledger up to that point world state]
    LOAD --> HORIZON[as of horizon filter memory]
    HORIZON --> ONLY[recall only what was lived by then]
    FOLD --> KNOWS[world reflects who is alive who rules]
```

- The **world** is folded from the canon ledger up to that story point (who is alive, who holds what).
- Memory retrieval applies an **as-of horizon**: any memory stamped *after* the chosen episode is excluded entirely. A lord rewound to S1E1 cannot recall — or even hint at — events that haven't happened yet.

> **Verified:** ask Cersei at S1E1 "Is Robert alive?" → she speaks as if he is. Rewind the same character to S1E9 → "Robert is dead, Joffrey sits the Iron Throne." Same genome, different episodic context.

## Putting it together: a scene end-to-end

```mermaid
sequenceDiagram
    participant SHOW as Showrunner
    participant COUNCIL as run_council
    participant A as Lord A
    participant B as Lord B
    participant REDIS as Redis memory
    participant WORLD as Shared world
    SHOW->>COUNCIL: cast setting stakes rounds
    loop each round
        COUNCIL->>A: perceive public history
        A->>REDIS: recall relevant memories as of horizon
        REDIS-->>A: top k memories
        A-->>COUNCIL: decision public stance vs private intent
        COUNCIL->>B: perceive public history A private intent hidden
        B-->>COUNCIL: decision
    end
    COUNCIL->>WORLD: resolve actions allies oaths secrets
    COUNCIL->>A: appraise drives shift
    A->>REDIS: encode new memory
    COUNCIL-->>SHOW: transcript plus appraisals
```

Every arrow above is captured in Weave as one nested trace, so the whole scene — including each hidden intent and each memory lookup — is a single inspectable artifact. See [04 · Weave](04-weave-deep-dive.md).
