"""
FastAPI routes:
  POST /api/sessions                  — create a new session
  GET  /api/sessions/{id}/profile     — get current profile
  POST /api/sessions/{id}/text        — send a text message
  POST /api/sessions/{id}/audio       — send audio for STT + agent + TTS
  WS   /ws/{session_id}               — real-time WebSocket connection
"""

import base64
import json
import logging
import uuid
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.agent.conversation import ConversationManager
from app.agent.voice import transcribe_audio, synthesize_speech
from app.api.websocket_manager import manager
from app.tools.notifier import send_lead_alert
from app.tools.visa_knowledge import get_visa_info

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory session store (swap for DB in production)
sessions: Dict[str, ConversationManager] = {}


# ─── Session management ─────────────────────────────────────────────────────

@router.post("/api/sessions")
async def create_session():
    session_id = str(uuid.uuid4())
    sessions[session_id] = ConversationManager(session_id)
    return {"session_id": session_id}


@router.get("/api/sessions/{session_id}/profile")
async def get_profile(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    profile = sessions[session_id].profile
    return profile.model_dump()


@router.get("/api/sessions/{session_id}/visa-info")
async def get_visa_info_route(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    profile = sessions[session_id].profile
    if not profile.destination or not profile.passport:
        return {"available": False}
    return {"available": True, **get_visa_info(profile.passport, profile.destination)}


@router.get("/api/sessions/{session_id}/events")
async def get_events(session_id: str):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    events = sessions[session_id].events
    return [e.model_dump() for e in events]


# ─── Text message ────────────────────────────────────────────────────────────

class TextMessage(BaseModel):
    message: str


@router.post("/api/sessions/{session_id}/text")
async def send_text(session_id: str, body: TextMessage):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    conv = sessions[session_id]
    response = await conv.process_message(body.message)

    # Push updates over WebSocket if connected
    await manager.send_transcript(session_id, "user", body.message)
    await manager.send_transcript(session_id, "assistant", response.text)

    if response.profile_updates:
        profile_data = conv.profile.model_dump()
        await manager.send_profile_update(session_id, profile_data)

    for event in response.events:
        await manager.send_decision_event(session_id, event.model_dump())

    if response.handoff:
        handoff_card = await conv.get_handoff_card()
        await manager.send_handoff(session_id, handoff_card.model_dump())

    if response.lead_alert_triggered:
        await send_lead_alert(conv.profile)

    return {
        "reply": response.text,
        "profile": conv.profile.model_dump(),
        "events": [e.model_dump() for e in response.events],
        "handoff": response.handoff,
        "lead_alert_triggered": response.lead_alert_triggered,
    }


# ─── Audio message ───────────────────────────────────────────────────────────

@router.post("/api/sessions/{session_id}/audio")
async def send_audio(
    session_id: str,
    audio: UploadFile = File(...),
):
    if session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    conv = sessions[session_id]
    await manager.send_status(session_id, "thinking")

    # Step 1: Transcribe
    audio_bytes = await audio.read()
    try:
        filename = audio.filename or "audio.webm"
        transcript = await transcribe_audio(audio_bytes, filename)
    except Exception as e:
        await manager.send_error(session_id, f"Transcription failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    if not transcript:
        await manager.send_status(session_id, "idle")
        return {"transcript": "", "reply": "", "audio": None}

    # Push transcript to dashboard
    await manager.send_transcript(session_id, "user", transcript)

    # Step 2: Process with agent
    response = await conv.process_message(transcript)

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

    # Push hot-lead alert if needed
    if response.lead_alert_triggered:
        await send_lead_alert(conv.profile)

    # Step 3: Synthesize speech
    await manager.send_status(session_id, "speaking")
    try:
        audio_bytes_out = await synthesize_speech(response.text)
        audio_b64 = base64.b64encode(audio_bytes_out).decode("utf-8")
    except Exception:
        logger.exception("TTS synthesis failed for session %s", session_id)
        audio_b64 = None

    await manager.send_status(session_id, "idle")

    return {
        "transcript": transcript,
        "reply": response.text,
        "audio": audio_b64,
        "profile": conv.profile.model_dump(),
        "handoff": response.handoff,
        "lead_alert_triggered": response.lead_alert_triggered,
    }


# ─── WebSocket ───────────────────────────────────────────────────────────────

@router.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await manager.connect(session_id, websocket)

    # Create session if it doesn't exist yet
    if session_id not in sessions:
        sessions[session_id] = ConversationManager(session_id)

    conv = sessions[session_id]

    # Send initial greeting
    greeting = "Hi there! I'm Aria, your travel concierge. Where are you planning to go?"
    from app.models.schemas import ConversationMessage
    conv.history.append(ConversationMessage(role="assistant", content=greeting))
    await manager.send_status(session_id, "idle")
    await manager.send_transcript(session_id, "assistant", greeting)

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
                    await send_lead_alert(conv.profile)

                # TTS
                await manager.send_status(session_id, "speaking")
                try:
                    audio_bytes = await synthesize_speech(response.text)
                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                    await manager.send_audio(session_id, audio_b64)
                except Exception:
                    logger.exception("TTS synthesis failed for session %s", session_id)

                await manager.send_status(session_id, "idle")

            elif msg_type == "ping":
                await manager.send(session_id, "pong", {})

    except WebSocketDisconnect:
        manager.disconnect(session_id)
