"""Author-phase pipelines (PART E) — offline, LLM-assisted, idempotent.

Submodules are imported directly (e.g. ``from got_agents.data_pipeline import
cores``) so loading a single authored core never drags in the ledger/world
modules — keeping the chatbot test cheap.
"""
