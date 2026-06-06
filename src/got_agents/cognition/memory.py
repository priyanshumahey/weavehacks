"""Episodic memory — a RedisVL-backed store with hybrid scored retrieval.

One HNSW/flat vector index per character. Retrieval pulls semantic candidates
then re-ranks with Park's weighted formula
``importance·0.4 + recency·0.3 + state_match·0.3`` (AGENT_SYSTEM_DESIGN.md A.4).

For Step 0 there is no live PAD affect, so ``state_match`` is approximated by
semantic similarity to the cue; the slot stays explicit so PAD drops in later.
"""

from __future__ import annotations

import time

import weave
from redisvl.index import SearchIndex
from redisvl.query import VectorQuery
from redisvl.query.filter import Tag
from redisvl.redis.utils import array_to_buffer
from redisvl.schema import IndexSchema

from got_agents.config import settings
from got_agents.cognition.types import Memory
from got_agents.infra import llm

_RETURN_FIELDS = ["id", "text", "importance", "timestamp", "concepts"]
_RECENCY_HALF_LIFE_DAYS = 3650.0  # canon memories are old; keep recency gentle


class MemoryStore:
    """A character's episodic memory stream."""

    def __init__(
        self,
        owner_key: str,
        *,
        dims: int | None = None,
        redis_url: str | None = None,
    ) -> None:
        self.owner_key = owner_key
        self.dims = dims or settings.embedding_dim
        self.index = SearchIndex(
            IndexSchema.from_dict(self._schema()),
            redis_url=redis_url or settings.redis_url,
        )

    def _schema(self) -> dict[str, object]:
        return {
            "index": {
                "name": f"mem:{self.owner_key}",
                "prefix": f"mem:{self.owner_key}",
                "storage_type": "hash",
            },
            "fields": [
                {"name": "id", "type": "tag"},
                {"name": "text", "type": "text"},
                {"name": "importance", "type": "numeric"},
                {"name": "timestamp", "type": "numeric"},
                {"name": "concepts", "type": "tag"},
                {
                    "name": "embedding",
                    "type": "vector",
                    "attrs": {
                        "dims": self.dims,
                        "distance_metric": "cosine",
                        "algorithm": "flat",
                        "datatype": "float32",
                    },
                },
            ],
        }

    def ensure(self) -> None:
        """Create the index if it does not already exist."""
        self.index.create(overwrite=False)

    def count(self) -> int:
        return self.index.info()["num_docs"]

    def is_empty(self) -> bool:
        return self.count() == 0

    def encode(self, memory: Memory) -> None:
        """Embed and upsert a memory (idempotent by ``memory.id``)."""
        record = {
            "id": memory.id,
            "text": memory.text,
            "importance": float(memory.importance),
            "timestamp": float(memory.timestamp),
            "concepts": ",".join(memory.concepts),
            "embedding": array_to_buffer(llm.embed(memory.text), "float32"),
        }
        self.index.load([record], id_field="id")

    @weave.op
    def retrieve(
        self,
        cue: str,
        k: int = 5,
        *,
        concepts: tuple[str, ...] | None = None,
        candidates: int = 20,
        now: float | None = None,
    ) -> list[Memory]:
        """Return the top-``k`` memories for ``cue`` by the weighted score.

        When ``concepts`` is given, retrieval is the A.4 hybrid query: vector
        similarity AND a Fixed-Bag ``concepts`` TAG filter (spreading
        activation). If nothing matches the tags, it falls back to an unfiltered
        vector search so recall never starves.
        """
        vector = llm.embed(cue)
        tag_filter = Tag("concepts") == list(concepts) if concepts else None
        rows = self._search(vector, candidates, tag_filter)
        if tag_filter is not None and not rows:
            rows = self._search(vector, candidates, None)
        now = now or time.time()
        scored = [self._score(row, now) for row in rows]
        scored.sort(key=lambda memory: memory.score or 0.0, reverse=True)
        return scored[:k]

    def _search(
        self,
        vector: list[float],
        candidates: int,
        tag_filter: object | None,
    ) -> list[dict[str, object]]:
        query = VectorQuery(
            vector=vector,
            vector_field_name="embedding",
            num_results=candidates,
            return_fields=_RETURN_FIELDS,
            return_score=True,
            filter_expression=tag_filter,
        )
        return self.index.query(query)

    def _score(self, row: dict[str, object], now: float) -> Memory:
        similarity = max(0.0, 1.0 - float(row["vector_distance"]))
        importance = float(row["importance"])
        timestamp = float(row["timestamp"])
        recency = self._recency(timestamp, now)
        score = 0.4 * importance + 0.3 * recency + 0.3 * similarity
        concepts = tuple(c for c in str(row.get("concepts", "")).split(",") if c)
        return Memory(
            id=str(row["id"]),
            text=str(row["text"]),
            importance=importance,
            timestamp=timestamp,
            concepts=concepts,
            score=score,
        )

    @staticmethod
    def _recency(timestamp: float, now: float) -> float:
        age_days = max(0.0, (now - timestamp) / 86400.0)
        return 0.5 ** (age_days / _RECENCY_HALF_LIFE_DAYS)
