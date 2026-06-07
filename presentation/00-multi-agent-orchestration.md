# 00 · Multi-Agent Orchestration — The Whole Picture

> The one diagram for the demo. **Many independent character-agents, each with its own private memory and motives, coordinated by a thin orchestration layer into emergent political drama** — all of it traced by Weave. This is the hackathon's headline: multi-agent orchestration done for real.

## The money shot

```mermaid
flowchart TB
    PREMISE[one premise the king is dying who takes the throne]

    subgraph HARNESS the orchestration layer mechanical never authors lines
        SHOW[Showrunner LLM frames the moment]
        DIR[Director schedules scenes carries state forward]
        SHOW --> DIR
        DIR --> ASSIGN[assign cast where stakes turn order]
    end
    PREMISE --> SHOW

    ASSIGN --> COUNCILA
    ASSIGN --> COUNCILB

    subgraph COUNCILA council throne room concurrent
        CERSEI[Cersei agent]
        LF[Littlefinger agent]
        CERSEI -->|public line| LF
        LF -->|public line| CERSEI
    end

    subgraph COUNCILB council the wall concurrent
        NED[Ned agent]
        TYRION[Tyrion agent]
        NED -->|public line| TYRION
        TYRION -->|public line| NED
    end

    CERSEI -.-> MC[(Cersei memory)]
    LF -.-> ML[(Littlefinger memory)]
    NED -.-> MN[(Ned memory)]
    TYRION -.-> MT[(Tyrion memory)]

    COUNCILA --> WORLD[shared world state oaths secrets alliances deaths]
    COUNCILB --> WORLD
    WORLD --> DIR

    COUNCILA --> CHRON[chronicle replayable episode]
    COUNCILB --> CHRON
    CHRON --> BODY[Phaser world plays it back]

    HARNESS -.traced.-> WEAVE[Weave one trace tree over everything]
    COUNCILA -.traced.-> WEAVE
    COUNCILB -.traced.-> WEAVE
```

**Read it in one breath:** a premise enters the **orchestration layer** (Showrunner frames it, Director schedules it); the Director convenes **several councils at once**; inside each council, **independent agents** take turns, each one consulting **its own private memory**; their actions resolve into **one shared world** that feeds back into the Director's next decision; the whole run is a single **Weave** trace and a replayable chronicle.

## Why each agent is genuinely its own agent

Every lord is a self-contained mind. No shared brain, no global memory — that separation is what makes the interactions a real multi-agent system rather than one model role-playing several voices.

```mermaid
flowchart LR
    subgraph AGENT one lord fully independent
        GENOME[genome who they are voice plus rules]
        DRIVES[8 political drives what they want]
        MEM[(own Redis memory what they have lived)]
        LOOP[cognitive loop perceive recall decide appraise reflect]
        GENOME --> LOOP
        DRIVES --> LOOP
        MEM <--> LOOP
    end
    LOOP --> DECISION[decision public stance plus hidden private intent]
```

| Each agent owns... | So that... |
|---|---|
| its **own genome** (persona, voice, learned rules) | Cersei sounds like Cersei, Ned like Ned |
| its **own 8 drives** (power, legacy, vengeance, ...) | motives differ and conflict |
| its **own Redis memory index** | it remembers only what *it* witnessed or was told |
| its **own cognitive loop** | it decides for itself — the harness never speaks for it |

## The information wall — why betrayal can emerge

The orchestration layer passes only **public lines** between agents. Each lord's `private_intent` never leaves the agent. A third agent in the room genuinely cannot see the scheme — so deception, secret pacts, and betrayal **emerge from the structure** instead of being scripted.

```mermaid
flowchart TB
    LF[Littlefinger decides]
    LF --> PUB[public stance I serve the realm]
    LF --> PRIV[private intent set the wolves against the lions]
    PUB --> ROOM[every other agent perceives this]
    PRIV -.never shared.-> ROOM
    PRIV --> MEMSELF[only his own memory keeps it]
    PRIV -.visible only to.-> JUDGE[Weave deception scorer]
```

## The orchestration layers, stacked

The harness is deliberately thin and has three mechanical roles — it **frames and schedules**, the agents **decide**.

```mermaid
flowchart TB
    SHOWRUNNER[Showrunner casts the moment into concurrent huddles]
    DIRECTOR[Director runs phases carries memory drives world forward re plans from what happened]
    COUNCIL[Council the turn taking primitive public only perception]
    AGENTS[Agents independent cognition each with own memory]
    SHOWRUNNER --> DIRECTOR --> COUNCIL --> AGENTS
    AGENTS -.actions resolve.-> DIRECTOR
```

- **Showrunner** — decomposes one premise into several simultaneous scenes (who, where, stakes).
- **Director** — runs the episode as a timeline: state carries forward, agents move between locations, each phase is re-planned from a digest of what just happened.
- **Council** — the shared turn-taking primitive every mode reuses; enforces that peers see public lines only.

## How state makes it an *episode*, not four chats

```mermaid
flowchart LR
    P1[phase 1 councils] --> RES1[resolve into shared world]
    RES1 --> LEARN1[agents appraise drives shift memories form]
    LEARN1 --> DIGEST[digest of what happened]
    DIGEST --> P2[phase 2 Director re plans allies converge wronged confront]
    P2 --> RES2[resolve]
    RES2 --> LEARN2[appraise]
    LEARN2 --> REFLECT[end of episode reflections written to each memory]
```

Because every agent keeps its **own** memory and drives across phases, an alliance sworn in phase 1 is *remembered* in phase 3, and a betrayal lands because the betrayed agent genuinely learned to trust first. The orchestration layer just keeps the clock and re-forms the rooms.

---

**See also:** [01 · System Architecture](01-system-architecture.md) · [02 · Agentic Design](02-agentic-design.md) · [03 · Redis](03-redis-deep-dive.md) · [04 · Weave](04-weave-deep-dive.md)
