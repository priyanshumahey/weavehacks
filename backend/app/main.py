"""FastAPI chat backend — talk to a Westeros character, rewound to any S1 episode.

    uv run --group backend uvicorn app.main:app --reload --port 8000
    (run from the backend/ directory)

Endpoints:
    GET  /api/health
    GET  /api/characters            -> the chat-ready cast with metadata
    GET  /api/episodes              -> the S1 rewind points
    POST /api/chat                  -> one chat turn (character + episode + message)
    DELETE /api/chat/{session_id}   -> clear a session's history

The agent logic is reused from ``got_agents`` (the same Lord behind the sim), so
a chat reply is grounded in the character's memory as of the chosen episode.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app import chat_service

load_dotenv()

_default_origins = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"]
_extra = os.getenv("CORS_ORIGINS", "")
ALLOWED_ORIGINS = _default_origins + [o.strip() for o in _extra.split(",") if o.strip()]

app = FastAPI(title="A Game of Agents — Chat API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    if os.getenv("ENABLE_WEAVE", "").lower() in {"1", "true", "yes"}:
        try:
            from got_agents.infra import init_weave

            init_weave()
        except Exception:
            pass


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "got-agents-chat"}


@app.get("/api/characters")
def characters() -> dict:
    return {"characters": chat_service.list_characters()}


@app.get("/api/episodes")
def episodes() -> dict:
    return {"episodes": chat_service.episodes()}


class ChatRequest(BaseModel):
    character: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)
    episode: str = Field(chat_service.DEFAULT_EPISODE)
    session_id: str = Field("default", min_length=1)


@app.post("/api/chat")
def chat(body: ChatRequest) -> dict:
    try:
        return chat_service.chat(
            body.character,
            body.message,
            episode=body.episode,
            session_id=body.session_id,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


class PrepareRequest(BaseModel):
    character: str = Field(..., min_length=1)
    message: str = Field("", description="latest user message / cue for recall")
    episode: str = Field(chat_service.DEFAULT_EPISODE)
    session_id: str = Field("default", min_length=1)
    play_as: str | None = Field(None, description="key of the character the user speaks as")


@app.post("/api/prepare")
def prepare(body: PrepareRequest) -> dict:
    """Assemble the grounded system prompt + inner state for one turn.

    Consumed by the CopilotKit Node runtime, which does the actual streaming.
    """
    try:
        return chat_service.prepare(
            body.character,
            body.message,
            episode=body.episode,
            session_id=body.session_id,
            play_as=body.play_as,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/inner-state/{session_id}")
def inner_state(session_id: str) -> dict:
    state = chat_service.inner_state(session_id)
    return {"state": state}


@app.delete("/api/chat/{session_id}")
def reset(session_id: str) -> dict:
    chat_service.reset_session(session_id)
    return {"status": "reset", "session_id": session_id}
