"""
FastAPI routes:
  POST /api/sessions                  — create a new session
  GET  /api/sessions/{id}/profile     — get current profile
  POST /api/sessions/{id}/text        — send a text message
  POST /api/sessions/{id}/audio       — send audio for STT + agent + TTS
  WS   /ws/{session_id}               — real-time WebSocket connection
"""

import asyncio
import base64
import json
import logging
import time
import uuid

from fastapi import (
    APIRouter, BackgroundTasks, WebSocket, WebSocketDisconnect,
    HTTPException, Request, UploadFile, File,
)
from pydantic import BaseModel, Field

from app.agent.conversation import ConversationManager
from app.agent.voice import transcribe_audio, synthesize_speech_sentences
from app.api.websocket_manager import manager
from app.core.rate_limit import limiter
from app.core.session_store import session_store
from app.tools.notifier import send_lead_alert
from app.tools.visa_knowledge import get_visa_info
from app.tools import (
    record_conversation_started,
    record_profile_completed,
    record_hot_lead,
    record_handoff,
    record_latency,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Generous for a ~30s WebM/Opus recording (the frontend caps recording
# length itself) while still rejecting anything wildly oversized before it
# wastes a Groq STT call.
MAX_AUDIO_BYTES = 8 * 1024 * 1024


def _fire_and_forget(coro) -> None:
    """WebSocket handlers have no response-lifecycle hook for BackgroundTasks
    to attach to, so non-critical work (notifications, analytics) there is
    scheduled this way instead — same "don't block the turn on it" intent."""
    asyncio.create_task(coro)


async def _record_turn_side_effects(session_id: str, response, profile, background_tasks: BackgroundTasks) -> None:
    """Analytics + notification bookkeeping shared by the text/audio routes
    and the WS handler — never on the critical path (item 14)."""
    if response.lead_alert_triggered:
        background_tasks.add_task(send_lead_alert, profile)
        background_tasks.add_task(record_hot_lead, session_id, profile.lead_score)
    if response.handoff:
        background_tasks.add_task(record_handoff, session_id)
    if response.profile_just_completed:
        background_tasks.add_task(record_profile_completed, session_id)
    if response.latency_ms is not None:
        background_tasks.add_task(record_latency, "llm_turn", response.latency_ms)


# ─── Session management ─────────────────────────────────────────────────────

@router.post("/api/sessions")
@limiter.limit("60/minute")
async def create_session(request: Request, background_tasks: BackgroundTasks):
    session_id = str(uuid.uuid4())
    await session_store.create(session_id)
    background_tasks.add_task(record_conversation_started, session_id)
    return {"session_id": session_id}


@router.get("/api/sessions/{session_id}/profile")
@limiter.limit("60/minute")
async def get_profile(request: Request, session_id: str):
    conv = await session_store.get(session_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return conv.profile.model_dump()


@router.get("/api/sessions/{session_id}/visa-info")
@limiter.limit("60/minute")
async def get_visa_info_route(request: Request, session_id: str):
    conv = await session_store.get(session_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Session not found")
    profile = conv.profile
    if not profile.destination or not profile.passport:
        return {"available": False}
    return {"available": True, **(await get_visa_info(profile.passport, profile.destination))}


@router.get("/api/sessions/{session_id}/events")
@limiter.limit("60/minute")
async def get_events(request: Request, session_id: str):
    conv = await session_store.get(session_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return [e.model_dump() for e in conv.events]


# ─── Text message ────────────────────────────────────────────────────────────

class TextMessage(BaseModel):
    message: str = Field(..., max_length=2000)


@router.post("/api/sessions/{session_id}/text")
@limiter.limit("20/minute")
async def send_text(request: Request, session_id: str, body: TextMessage, background_tasks: BackgroundTasks):
    conv = await session_store.get(session_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Session not found")

    response = await conv.process_message(body.message)
    await session_store.save(session_id, conv)

    # Push updates over WebSocket if connected
    await manager.send_transcript(session_id, "user", body.message)
    await manager.send_transcript(session_id, "assistant", response.text)

    if response.profile_updates:
        await manager.send_profile_update(session_id, conv.profile.model_dump())

    for event in response.events:
        await manager.send_decision_event(session_id, event.model_dump())

    if response.handoff:
        handoff_card = await conv.get_handoff_card()
        await manager.send_handoff(session_id, handoff_card.model_dump())

    await _record_turn_side_effects(session_id, response, conv.profile, background_tasks)

    return {
        "reply": response.text,
        "profile": conv.profile.model_dump(),
        "events": [e.model_dump() for e in response.events],
        "handoff": response.handoff,
        "lead_alert_triggered": response.lead_alert_triggered,
    }


# ─── Audio message ───────────────────────────────────────────────────────────

@router.post("/api/sessions/{session_id}/audio")
@limiter.limit("20/minute")
async def send_audio(
    request: Request,
    session_id: str,
    background_tasks: BackgroundTasks,
    audio: UploadFile = File(...),
):
    conv = await session_store.get(session_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if not audio.content_type or not audio.content_type.startswith("audio/"):
        raise HTTPException(status_code=415, detail="Expected an audio/* upload")

    chunks = bytearray()
    while True:
        chunk = await audio.read(1024 * 1024)
        if not chunk:
            break
        chunks.extend(chunk)
        if len(chunks) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio upload too large")
    audio_bytes = bytes(chunks)

    await manager.send_status(session_id, "thinking")

    # Step 1: Transcribe
    stt_start = time.perf_counter()
    try:
        filename = audio.filename or "audio.webm"
        transcript = await transcribe_audio(audio_bytes, filename)
    except Exception as e:
        logger.exception("Transcription failed for session %s", session_id)
        await manager.send_error(session_id, f"Transcription failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    background_tasks.add_task(record_latency, "stt", (time.perf_counter() - stt_start) * 1000)

    if not transcript:
        await manager.send_status(session_id, "idle")
        return {"transcript": "", "reply": "", "audio": None}

    # Push transcript to dashboard
    await manager.send_transcript(session_id, "user", transcript)

    # Step 2: Process with agent
    response = await conv.process_message(transcript)
    await session_store.save(session_id, conv)

    # Push agent transcript
    await manager.send_transcript(session_id, "assistant", response.text)

    # Push profile updates
    if response.profile_updates:
        await manager.send_profile_update(session_id, conv.profile.model_dump())

    # Push decision events
    for event in response.events:
        await manager.send_decision_event(session_id, event.model_dump())

    # Push handoff if needed
    if response.handoff:
        handoff_card = await conv.get_handoff_card()
        await manager.send_handoff(session_id, handoff_card.model_dump())

    await _record_turn_side_effects(session_id, response, conv.profile, background_tasks)

    # Step 3: Synthesize speech — sentence-by-sentence over the WebSocket
    # (item 8) so playback can start on the first sentence instead of
    # waiting for the whole reply to finish synthesizing. Also still return
    # one full clip in the REST body below for callers not on the socket.
    await manager.send_status(session_id, "speaking")
    tts_start = time.perf_counter()
    first_chunk_b64 = None
    try:
        async for chunk in synthesize_speech_sentences(response.text):
            chunk_b64 = base64.b64encode(chunk).decode("utf-8")
            if first_chunk_b64 is None:
                first_chunk_b64 = chunk_b64
            else:
                await manager.send_audio(session_id, chunk_b64)
    except Exception:
        logger.exception("TTS synthesis failed for session %s", session_id)
    background_tasks.add_task(record_latency, "tts", (time.perf_counter() - tts_start) * 1000)

    await manager.send_status(session_id, "idle")

    return {
        "transcript": transcript,
        "reply": response.text,
        "audio": first_chunk_b64,
        "profile": conv.profile.model_dump(),
        "handoff": response.handoff,
        "lead_alert_triggered": response.lead_alert_triggered,
    }


# ─── WebSocket ───────────────────────────────────────────────────────────────

@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)

    conv = await session_store.get(session_id)
    if conv is None:
        conv = await session_store.create(session_id)

    # Send initial greeting — spoken, not just text, since this is a
    # voice-first flow and a silent transcript-only greeting means the user
    # never actually hears Aria ask for their name before they start talking.
    # Gated on empty history (not "session missing") because the frontend
    # always creates the session via POST /api/sessions before opening the
    # socket, so by the time we get here the session already exists —
    # history is what actually distinguishes a fresh session from a
    # reconnect, and a reconnect must NOT replay the greeting audio over
    # whatever the user is mid-conversation doing.
    if not conv.history:
        greeting = "Hi there! I'm Aria, your travel concierge. What's your name?"
        from app.models.schemas import ConversationMessage
        conv.history.append(ConversationMessage(role="assistant", content=greeting))
        await session_store.save(session_id, conv)
        await manager.send_transcript(session_id, "assistant", greeting)
        await manager.send_status(session_id, "speaking")
        try:
            async for chunk in synthesize_speech_sentences(greeting):
                await manager.send_audio(session_id, base64.b64encode(chunk).decode("utf-8"))
        except Exception:
            logger.exception("Greeting TTS failed for session %s", session_id)

    await manager.send_status(session_id, "idle")

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)
            msg_type = msg.get("type")

            if msg_type == "text":
                user_text = msg.get("text", "").strip()
                if not user_text:
                    continue

                await manager.send_status(session_id, "thinking")
                response = await conv.process_message(user_text)
                await session_store.save(session_id, conv)
                await manager.send_transcript(session_id, "user", user_text)
                await manager.send_transcript(session_id, "assistant", response.text)

                if response.profile_updates:
                    await manager.send_profile_update(session_id, conv.profile.model_dump())

                for event in response.events:
                    await manager.send_decision_event(session_id, event.model_dump())

                if response.handoff:
                    handoff_card = await conv.get_handoff_card()
                    await manager.send_handoff(session_id, handoff_card.model_dump())

                if response.lead_alert_triggered:
                    _fire_and_forget(send_lead_alert(conv.profile))
                    _fire_and_forget(record_hot_lead(session_id, conv.profile.lead_score))
                if response.handoff:
                    _fire_and_forget(record_handoff(session_id))
                if response.profile_just_completed:
                    _fire_and_forget(record_profile_completed(session_id))
                if response.latency_ms is not None:
                    _fire_and_forget(record_latency("llm_turn", response.latency_ms))

                # TTS — sentence-by-sentence, same streaming behavior as
                # the /audio route.
                await manager.send_status(session_id, "speaking")
                try:
                    async for chunk in synthesize_speech_sentences(response.text):
                        await manager.send_audio(session_id, base64.b64encode(chunk).decode("utf-8"))
                except Exception:
                    logger.exception("TTS synthesis failed for session %s", session_id)

                await manager.send_status(session_id, "idle")

            elif msg_type == "ping":
                await manager.send(session_id, "pong", {})

    except WebSocketDisconnect:
        manager.disconnect(session_id)
