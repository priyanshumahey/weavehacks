"""Runtime configuration resolved once from the environment."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()

# Repo root = three levels up from this file (src/got_agents/config.py).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


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
    data_dir: str = os.environ.get("GOT_DATA_DIR", os.path.join(_REPO_ROOT, "data"))

    # LLM provider toggle. "openai" (default) uses the OpenAI API; "azure" uses
    # Azure OpenAI. Flip with the single LLM_PROVIDER env var to switch back.
    llm_provider: str = os.environ.get("LLM_PROVIDER", "openai").strip().lower()
    azure_openai_api_key: str | None = os.environ.get("AZURE_OPENAI_API_KEY")
    azure_openai_endpoint: str | None = os.environ.get("AZURE_OPENAI_ENDPOINT")
    azure_openai_api_version: str = os.environ.get(
        "AZURE_OPENAI_API_VERSION", "2024-12-01-preview"
    )
    # Azure deployment names (default to the matching model name, a common
    # convention; override per-resource via env).
    azure_openai_chat_deployment: str = os.environ.get(
        "AZURE_OPENAI_CHAT_DEPLOYMENT", "gpt-5.5"
    )
    azure_openai_embed_deployment: str = os.environ.get(
        "AZURE_OPENAI_EMBED_DEPLOYMENT", "text-embedding-3-small"
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
