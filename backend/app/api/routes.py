"""
HTTP API (contract: docs/API.md). Every update comes back in the response of
the request that caused it; there is no WebSocket.

  POST /api/sessions                    create (or rebuild with seed_profile + history)
  POST /api/sessions/{id}/text          text turn (?tts=1 adds an MP3 of the reply)
  POST /api/sessions/{id}/audio         voice-lite turn: WAV in, transcript + reply + MP3 out
  POST /api/sessions/{id}/live-token    1-use ephemeral token for Gemini Live
  POST /api/sessions/{id}/tools         execute Live tool calls
  POST /api/sessions/{id}/transcript    store Live-mode transcript turns
  GET  /api/sessions/{id}/visa-info     VisaInfo for the current corridor
"""

import base64
import io
import logging
import time
import uuid
import wave
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field

from app.agent.conversation import ConversationManager, TurnOutcome
from app.agent.live_session import mint_live_token
from app.agent.prompts import GREETING
from app.agent.tool_executor import execute_tool_calls
from app.agent.voice import DEFAULT_VOICE, synthesize_speech
from app.core.rate_limit import limiter
from app.core.session_store import session_store
from app.tools import (
    record_conversation_started,
    record_handoff,
    record_hot_lead,
    record_latency,
    record_live_token,
    record_profile_completed,
)
from app.tools.notifier import send_handoff_alert, send_lead_alert
from app.tools.visa_knowledge import get_visa_info

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_AUDIO_BYTES = 2 * 1024 * 1024      # 30 s of 16 kHz mono PCM16 is ~0.96 MB
MAX_AUDIO_SECONDS = 30.5
MAX_LIVE_TOKENS_PER_SESSION = 8


# ─── Request bodies ─────────────────────────────────────────────────────────

class HistoryTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: str = Field(..., max_length=2000)


class CreateSessionBody(BaseModel):
    seed_profile: Optional[dict] = None
    history: Optional[list[HistoryTurn]] = Field(default=None, max_length=50)


class TextMessage(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class LiveTokenBody(BaseModel):
    resume_handle: Optional[str] = Field(default=None, max_length=4096)


class ToolCall(BaseModel):
    id: Optional[str] = Field(default=None, max_length=200)
    name: str = Field(..., max_length=100)
    args: dict = Field(default_factory=dict)


class ToolCallsBody(BaseModel):
    calls: list[ToolCall] = Field(..., max_length=8)


class TranscriptBody(BaseModel):
    turns: list[HistoryTurn] = Field(..., max_length=50)


# ─── Helpers ────────────────────────────────────────────────────────────────

async def _get_conv(session_id: str) -> ConversationManager:
    conv = await session_store.get(session_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return conv


async def _visa_for(conv: ConversationManager) -> Optional[dict]:
    p = conv.profile
    if not (p.passport and p.destination) or p.pending_clarification:
        return None
    return await get_visa_info(p.passport, p.destination)


async def _turn_payload(
    conv: ConversationManager, outcome: TurnOutcome, background_tasks: BackgroundTasks,
) -> dict:
    """The common `Turn` body, plus side effects (alerts, analytics) queued
    to run after the response is sent."""
    sid = conv.session_id
    card = None
    if outcome.handoff:
        card = await conv.get_handoff_card(outcome.handoff_reason)
        background_tasks.add_task(send_handoff_alert, conv.profile.model_copy(), card)
        background_tasks.add_task(record_handoff, sid)
    if outcome.lead_alert:
        background_tasks.add_task(send_lead_alert, conv.profile.model_copy())
        background_tasks.add_task(record_hot_lead, sid, conv.profile.lead_score)
    if outcome.profile_just_completed:
        background_tasks.add_task(record_profile_completed, sid)
    return {
        "profile": conv.profile.model_dump(mode="json"),
        "events": [e.model_dump(mode="json") for e in outcome.events],
        "handoff": outcome.handoff,
        "handoff_card": card.model_dump(mode="json") if card else None,
        "visa": await _visa_for(conv),
    }


async def _tts_b64(text: str, language: Optional[str], background_tasks: BackgroundTasks) -> Optional[str]:
    start = time.perf_counter()
    try:
        audio = await synthesize_speech(text, language)
    except Exception:
        if not language or language.lower().startswith("en"):
            logger.warning("TTS failed", exc_info=True)
            return None
        try:  # a language-specific voice failed: English voice beats silence
            audio = await synthesize_speech(text, None)
        except Exception:
            logger.warning("TTS failed (fallback voice %s)", DEFAULT_VOICE, exc_info=True)
            return None
    background_tasks.add_task(record_latency, "tts", (time.perf_counter() - start) * 1000)
    return base64.b64encode(audio).decode("ascii") if audio else None


def _validate_wav(data: bytes) -> None:
    try:
        with wave.open(io.BytesIO(data), "rb") as w:
            frames, rate, channels = w.getnframes(), w.getframerate(), w.getnchannels()
    except (wave.Error, EOFError):
        raise HTTPException(status_code=415, detail="Expected a WAV file (16 kHz mono PCM16)")
    if rate <= 0 or channels <= 0:
        raise HTTPException(status_code=415, detail="Invalid WAV header")
    if frames / rate > MAX_AUDIO_SECONDS:
        raise HTTPException(status_code=413, detail="Audio longer than 30 seconds")
    if frames == 0:
        raise HTTPException(status_code=400, detail="Empty audio")


# ─── Sessions ───────────────────────────────────────────────────────────────

@router.post("/api/sessions")
@limiter.limit("30/minute")
async def create_session(
    request: Request, background_tasks: BackgroundTasks, body: Optional[CreateSessionBody] = None,
):
    session_id = str(uuid.uuid4())
    conv = await session_store.create(session_id)
    history = [t.model_dump() for t in (body.history or [])] if body else []
    seed = body.seed_profile if body else None
    if seed or history:
        conv.seed(seed, history)
    if not conv.history:
        conv.add_transcript([{"role": "assistant", "text": GREETING}])
        background_tasks.add_task(record_conversation_started, session_id)
    await session_store.save(conv)
    return {"session_id": session_id, "greeting": GREETING, "profile": conv.profile.model_dump(mode="json")}


@router.get("/api/sessions/{session_id}/visa-info")
@limiter.limit("60/minute")
async def get_visa_info_route(request: Request, session_id: str):
    conv = await _get_conv(session_id)
    visa = await _visa_for(conv)
    return visa if visa is not None else {"available": False}


# ─── Text turn ──────────────────────────────────────────────────────────────

@router.post("/api/sessions/{session_id}/text")
@limiter.limit("20/minute")
async def send_text(
    request: Request,
    session_id: str,
    body: TextMessage,
    background_tasks: BackgroundTasks,
    tts: int = Query(default=0, ge=0, le=1),
):
    conv = await _get_conv(session_id)
    async with conv.lock:
        turn = await conv.process_message(body.message)
        payload = await _turn_payload(conv, turn.outcome, background_tasks)
        await session_store.save(conv)
    background_tasks.add_task(record_latency, "llm_turn", turn.latency_ms)
    payload["reply"] = turn.reply
    if tts:
        payload["audio_b64"] = await _tts_b64(turn.reply, turn.reply_language, background_tasks)
    return payload


# ─── Voice-lite turn ────────────────────────────────────────────────────────

@router.post("/api/sessions/{session_id}/audio")
@limiter.limit("20/minute")
async def send_audio(
    request: Request,
    session_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    conv = await _get_conv(session_id)
    data = bytearray()
    while chunk := await file.read(256 * 1024):
        data.extend(chunk)
        if len(data) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio upload too large")
    _validate_wav(bytes(data))

    async with conv.lock:
        turn = await conv.process_audio(bytes(data))
        payload = await _turn_payload(conv, turn.outcome, background_tasks)
        await session_store.save(conv)
    background_tasks.add_task(record_latency, "audio_turn", turn.latency_ms)
    payload["user_transcript"] = turn.user_transcript or ""
    payload["reply"] = turn.reply
    payload["audio_b64"] = await _tts_b64(turn.reply, turn.reply_language, background_tasks)
    return payload


# ─── Gemini Live ────────────────────────────────────────────────────────────

@router.post("/api/sessions/{session_id}/live-token")
@limiter.limit("6/minute")
async def live_token(
    request: Request, session_id: str, background_tasks: BackgroundTasks, body: Optional[LiveTokenBody] = None,
):
    conv = await _get_conv(session_id)
    async with conv.lock:
        if conv.live_tokens_issued >= MAX_LIVE_TOKENS_PER_SESSION:
            raise HTTPException(status_code=429, detail="busy")
        try:
            result = await mint_live_token(conv, body.resume_handle if body else None)
        except Exception as exc:
            logger.warning("Live token minting failed for session %s: %s", session_id, type(exc).__name__)
            raise HTTPException(status_code=502, detail="Could not start a live session")
        conv.live_tokens_issued += 1
        await session_store.save(conv)
    background_tasks.add_task(record_live_token, session_id)
    return result


@router.post("/api/sessions/{session_id}/tools")
@limiter.limit("120/minute")
async def run_tools(request: Request, session_id: str, body: ToolCallsBody, background_tasks: BackgroundTasks):
    conv = await _get_conv(session_id)
    async with conv.lock:
        outcome, function_responses = await execute_tool_calls(conv, [c.model_dump() for c in body.calls])
        payload = await _turn_payload(conv, outcome, background_tasks)
        await session_store.save(conv)
    payload["function_responses"] = function_responses
    return payload


@router.post("/api/sessions/{session_id}/transcript")
@limiter.limit("60/minute")
async def add_transcript(request: Request, session_id: str, body: TranscriptBody):
    conv = await _get_conv(session_id)
    async with conv.lock:
        conv.add_transcript([t.model_dump() for t in body.turns])
        await session_store.save(conv)
    return {"ok": True}
