# A Game of Agents

Generative political agents for Westeros — a WeaveHacks project. See [`Docs/`](Docs/Home.md) for the full design.

## Layout

| Path | What lives here |
|---|---|
| `infra/` | Docker service configs — `redis/redis.conf` |
| `src/got_agents/` | The Python package — `config`, `db` |
| `tests/` | Pytest suite (connectivity checks) |
| `scripts/` | Operational shell scripts — `stack.sh`, data helpers |
| `analysis/` | Marimo data exploration |
| `data/` | Raw datasets |
| `Docs/` | Design docs (separate private repo) |

## Quick start

```bash
cp .env.example .env          # fill in OPENAI_API_KEY / WANDB_API_KEY
./scripts/stack.sh up         # start Redis 8 + Postgres 17 (+ RedisInsight)
uv sync                       # install the package + deps (editable)
uv run pytest                 # verify the data layer works
```

## Data stack

- **Redis** (`redis://localhost:6379`) — vector memory, event bus, cache.
- **Postgres** (`postgresql://got:got@localhost:5432/got`) — durable record.
- **RedisInsight** GUI — http://localhost:5540 → connect to host `redis`, port `6379`.

`./scripts/stack.sh` manages it all: `up` · `down` · `ps` · `logs [svc]` · `redis-cli` · `psql` · `nuke` (wipes volumes).
