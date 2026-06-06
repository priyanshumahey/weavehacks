"""Runtime configuration resolved once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    redis_url: str = os.environ.get("REDIS_URL", "redis://localhost:6379")
    database_url: str = os.environ.get(
        "DATABASE_URL", "postgresql://got:got@localhost:5432/got"
    )
    openai_api_key: str | None = os.environ.get("OPENAI_API_KEY")
    wandb_api_key: str | None = os.environ.get("WANDB_API_KEY")
    weave_project: str = os.environ.get("WEAVE_PROJECT", "weavehacks/got-agents")
    embedding_dim: int = int(os.environ.get("EMBEDDING_DIM", "1536"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
