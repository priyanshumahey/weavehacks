"""Train/val/test split — a three-way, leak-free protocol (PART C.6).

The operators (Reflexion, OPRO) **mine** the TRAIN scenes; **selection** (which
candidate genome to keep) is decided on a held-out VALIDATION slice the
operators never optimize directly; the reported headline is the TEST split — a
*different season* the agent has never seen. Three disjoint sets, three jobs:

  TRAIN (S1-S2 + S3 e1-e7): Reflexion mines rules + OPRO proposes personas here.
  VAL   (S3 e8-e10):        elitist keep-best is decided here (model selection).
  TEST  (S4 e1-e10):        the honest headline — generalization to the future.

Keeping selection off the train signal stops the loop from chasing scenes the
operators already saw; keeping the headline on a future season proves the
learned voice transfers, not memorizes. Test sets are per-character (some
characters have no S4 lines because they die earlier), so callers must handle an
empty TEST set.
"""

from __future__ import annotations

# Learn from the first three seasons; hold out the tail of S3 for selection and
# an entirely unseen S4 as the honest generalization headline.
TRAIN_EPISODES: tuple[str, ...] = (
    tuple(f"s1e{e}" for e in range(1, 11))
    + tuple(f"s2e{e}" for e in range(1, 11))
    + tuple(f"s3e{e}" for e in range(1, 8))
)
VAL_EPISODES: tuple[str, ...] = tuple(f"s3e{e}" for e in range(8, 11))
TEST_EPISODES: tuple[str, ...] = tuple(f"s4e{e}" for e in range(1, 11))


def train_episodes() -> tuple[str, ...]:
    return TRAIN_EPISODES


def val_episodes() -> tuple[str, ...]:
    return VAL_EPISODES


def test_episodes() -> tuple[str, ...]:
    return TEST_EPISODES

