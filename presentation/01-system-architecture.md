# 01 · System Architecture

> The whole stack, end-to-end. A **mind / body split**: the *body* is a TypeScript Phaser world that plays back episodes; the *mind* is a Python cognition + orchestration engine; **Redis** is the memory substrate; **Weave** traces and evaluates everything; **OpenAI** is the model provider.

## Full-stack topology

```mermaid
flowchart TB
    subgraph CLIENT browser
        WORLD[Phaser world living map plays chronicles]
        CHAT[CopilotKit chat talk to any lord rewound]
    end

    subgraph EDGE node services
        CK[CopilotKit runtime streams replies]
        VITE[Vite dev server proxies api]
    end

    subgraph BACKEND FastAPI python
        API[REST api characters chat scene episode]
        SCENE[scene_service the thin glue]
        CHATS[chat_service grounded prompts]
    end

    subgraph MIND got_agents python the brain
        ORCH[orchestration directors plus showrunner]
        FLOWS[flows council the primitive]
        AGENT[agent Lord cognition]
        COG[cognition memory drives identity]
        TRAIN[training evolution plus eval]
        OUT[outputs chronicle plus contracts]
    end

    subgraph INFRA stores and services
        REDIS[(Redis RedisVL vector memory)]
        WEAVE[Weave traces evals leaderboard]
        OPENAI[OpenAI gpt plus embeddings]
        DATA[(canon data scripts ledgers genomes)]
    end

    WORLD --> VITE --> API
    CHAT --> CK --> API
    API --> SCENE --> ORCH
    API --> CHATS --> AGENT
    ORCH --> FLOWS --> AGENT --> COG
    COG <--> REDIS
    AGENT --> OPENAI
    COG --> OPENAI
    TRAIN --> AGENT
    TRAIN --> WEAVE
    ORCH --> OUT --> WORLD
    DATA --> COG
    DATA --> TRAIN

    AGENT -.weave op.-> WEAVE
    ORCH -.weave op.-> WEAVE
    FLOWS -.weave op.-> WEAVE
    COG -.weave op.-> WEAVE
```

## The layers (down-only imports — the load-bearing rule)

The codebase enforces a strict **import direction**: `agent/` and everything below it never import `flows / world / orchestration`. That "chatbot test" is what keeps a single character runnable in isolation (for chat and for clean eval) while the harness composes them above.

```mermaid
flowchart TB
    L5[L5 outputs chronicles plus world contracts]
    L4[L4 orchestration directors plus showrunner]
    L3[L3 flows council the scene primitive]
    L2[L2 agent Lord perceive decide appraise reflect]
    L1[L1 cognition memory drives identity]
    L0[L0 infra llm plus weave plus redis config]
    L5 --> L4 --> L3 --> L2 --> L1 --> L0
```

| Layer | Module | Responsibility |
|---|---|---|
| L0 | `infra/` | `llm` (complete / complete_json / embed), `weave_setup`, config |
| L1 | `cognition/` | **Redis** memory store, 8 political drives, identity |
| L2 | `agent/` | `Lord` — the cognitive loop + the deception substrate |
| L3 | `flows/` | `run_council` + the showrunner planners |
| L4 | `orchestration/` | directors that stage whole episodes |
| L5 | `outputs/` | chronicles + the locked JSON contract the world plays |

## Where Redis and Weave sit

```mermaid
flowchart LR
    subgraph PER TURN runtime
        ACT[Lord acts]
        ACT --> R1[recall from Redis as of horizon]
        ACT --> W1[traced as weave op]
        ACT --> ENC[encode new memory to Redis]
    end
    subgraph PER GENERATION training
        EVAL[score genome vs canon]
        EVAL --> W2[weave Evaluation]
        W2 --> BOARD[weave Leaderboard]
    end
    R1 --- REDIS[(Redis)]
    ENC --- REDIS
    W1 --- WEAVE[Weave]
    W2 --- WEAVE
    BOARD --- WEAVE
```

- **Redis** is the *runtime substrate*: every character's episodic memory is a vector index it reads at decision time and writes after reflection. Deep dive → [03](03-redis-deep-dive.md).
- **Weave** is the *observability + science substrate*: every cognitive op is a trace, and the training loop publishes evals + a leaderboard. Deep dive → [04](04-weave-deep-dive.md).
- **OpenAI** (`gpt-5.5` + `text-embedding-3-small`) is the model provider, auto-patched into the Weave trace tree. A single `LLM_PROVIDER` env flag swaps to Azure OpenAI.
- **Postgres** is wired in config but intentionally unused — canon lives as versioned JSON (ledgers, skeletons, genomes) so the whole world is reproducible from the repo.

## Two timescales

```mermaid
flowchart LR
    subgraph INNER an episode
        E[run episode] --> C[chronicle traced]
    end
    subgraph OUTER a season of training
        G[generation] --> S[Weave fidelity score]
        S --> M[mutate plus select genome]
        M --> G
    end
    C -.optional canon exemplars.-> G
```

The **inner loop** is one episode of the harness (memory + drives accumulate). The **outer loop** is evolution across episodes (the genome's voice improves). They are deliberately separate climbs so each is measured cleanly.
