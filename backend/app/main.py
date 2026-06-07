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

from app import chat_service, saved_scenes, scene_service

load_dotenv()

_default_origins = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"]
_extra = os.getenv("CORS_ORIGINS", "")
ALLOWED_ORIGINS = _default_origins + [o.strip() for o in _extra.split(",") if o.strip()]

app = FastAPI(title="Storyboard — Chat API", version="0.1.0")
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
    return {"status": "ok", "service": "storyboard-chat"}


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


@app.get("/api/scene/roster")
def scene_roster() -> dict:
    """Characters that can be staged in a scene (core + world sprite)."""
    return {"roster": scene_service.roster(), "options": scene_service.options()}


class SceneRequest(BaseModel):
    cast: list[str] = Field(..., min_length=scene_service.MIN_CAST)
    setting: str = Field("", description="where/when the scene happens")
    stakes: str = Field("", description="what each party wants from it")
    episode: str = Field(scene_service.DEFAULT_EPISODE)
    location: str = Field(scene_service.DEFAULT_LOCATION)
    max_rounds: int = Field(scene_service.DEFAULT_MAX_ROUNDS, ge=1, le=4)


@app.post("/api/scene")
def scene(body: SceneRequest) -> dict:
    """Run a one-off council scene; return the world-facing ensemble JSON."""
    try:
        ensemble = scene_service.build_scene(
            body.cast,
            setting=body.setting,
            stakes=body.stakes,
            episode=body.episode,
            location=body.location,
            max_rounds=body.max_rounds,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    meta = saved_scenes.save(
        ensemble,
        premise=body.setting,
        episode=body.episode,
        location=body.location,
        kind="scene",
    )
    return {"ensemble": ensemble, "scene": meta}


class EpisodeRequest(BaseModel):
    premise: str = Field(..., min_length=1, description="one dramatic premise to direct")
    cast_pool: list[str] = Field(
        default_factory=list,
        description="optional keys to restrict the director's casting",
    )
    episode: str = Field(scene_service.DEFAULT_EPISODE)
    location: str = Field(scene_service.DEFAULT_LOCATION)
    max_groups: int = Field(scene_service.DEFAULT_MAX_GROUPS, ge=1, le=5)
    max_rounds: int = Field(scene_service.DEFAULT_MAX_ROUNDS, ge=1, le=4)
    encounters: int = Field(
        scene_service.DEFAULT_MAX_ENCOUNTERS,
        ge=0,
        le=5,
        description="incidental two-person meetings to precompute for the mingle",
    )
    acts: int = Field(
        1,
        ge=1,
        le=scene_service.HARD_MAX_ACTS,
        description="number of acts; >1 directs a continuous multi-act episode "
        "(state carried forward, groups re-form between acts)",
    )


@app.post("/api/episode")
def episode_scene(body: EpisodeRequest) -> dict:
    """Direct a whole moment from one premise.

    ``acts == 1`` (default) stages one batch of concurrent conversations.
    ``acts > 1`` directs a *continuous* multi-act episode: the same cast carries
    its memory/drives across acts, actions mutate a shared world, and groups
    re-form between acts from what just happened.
    """
    try:
        if body.acts > 1:
            ensemble = scene_service.build_directed_episode(
                body.premise,
                cast_pool=body.cast_pool or None,
                episode=body.episode,
                location=body.location,
                acts=body.acts,
                max_groups=body.max_groups,
                max_rounds=body.max_rounds,
            )
        else:
            ensemble = scene_service.build_episode(
                body.premise,
                cast_pool=body.cast_pool or None,
                episode=body.episode,
                location=body.location,
                max_groups=body.max_groups,
                max_rounds=body.max_rounds,
                encounters=body.encounters,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    meta = saved_scenes.save(
        ensemble,
        premise=body.premise,
        episode=body.episode,
        location=body.location,
        kind="episode",
    )
    return {"ensemble": ensemble, "scene": meta}


@app.get("/api/scenes")
def scenes_library() -> dict:
    """List previously saved scenes (newest first) for replay."""
    return {"scenes": saved_scenes.list_saved()}


@app.get("/api/scenes/{name}")
def saved_scene(name: str) -> dict:
    """Load a saved scene's ensemble by name."""
    ensemble = saved_scenes.load(name)
    if ensemble is None:
        raise HTTPException(status_code=404, detail=f"no saved scene {name!r}")
    return {"ensemble": ensemble}
