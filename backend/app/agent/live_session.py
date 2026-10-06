"""
Gemini Live: the locked session config and ephemeral-token minting.

The browser talks to Gemini Live directly (native speech-to-speech) using a
single-use ephemeral token. Everything that matters (model, system
instruction with the current profile, tools, voice, VAD, transcription,
context compression, session resumption) is fixed inside the token here, so
the browser can't change the persona or point the key at another model.

Field names and the v1alpha requirement were verified against
gemini-3.8-live on 2026-10-06; see backend/LIVE_NOTES.md.
"""

import datetime as dt
import logging
from typing import Optional

from google.genai import types

from app.agent import gemini_client
from app.agent.llm_schema import PURPOSES
from app.agent.prompts import LIVE_MODE_NOTE, SYSTEM_PROMPT

logger = logging.getLogger(__name__)

TOKEN_CONNECT_WINDOW = dt.timedelta(minutes=2)   # must open the socket within this
TOKEN_SESSION_LIFETIME = dt.timedelta(minutes=30)
LIVE_HISTORY_TURNS = 12

_S = types.Schema
_T = types.Type

UPDATE_PROFILE = types.FunctionDeclaration(
    name="update_profile",
    description=(
        "Record trip details the user just stated. Pass only the fields they mentioned. "
        "Call it every time they share a new detail, then reply to them."
    ),
    # Blocking: as NON_BLOCKING + SILENT, a turn consisting only of this call
    # ended with no spoken reply at all (seen with gemini-3.8-live). Blocking
    # makes the model always answer after the result (~1 s, only on turns that
    # carry new details).
    behavior=types.Behavior.BLOCKING,
    parameters=_S(
        type=_T.OBJECT,
        properties={
            "destination": _S(type=_T.STRING, description="Destination country in English, or the place as said if it isn't a country"),
            "passport": _S(type=_T.STRING, description="Passport / nationality country in English, e.g. India"),
            "travelers": _S(type=_T.INTEGER, description="Number of people travelling"),
            "travel_month": _S(type=_T.STRING, description="Month of travel, e.g. December"),
            "travel_dates": _S(type=_T.STRING, description="Specific dates if given"),
            "purpose": _S(type=_T.STRING, enum=PURPOSES, description="Honeymoon/holiday count as tourism"),
            "budget": _S(type=_T.STRING, description="Budget as the user said it"),
            "customer_name": _S(type=_T.STRING, description="The user's name"),
            "first_schengen": _S(type=_T.BOOLEAN, description="True if this is their first Schengen trip"),
            "confidence": _S(type=_T.NUMBER, description="0-1, how sure you are these values are right"),
        },
    ),
)

LOOKUP_VISA = types.FunctionDeclaration(
    name="lookup_visa",
    description=(
        "Get verified visa requirements for a passport and destination. Call it before stating any "
        "visa requirement, fee, processing time or document. Answer only from the result."
    ),
    behavior=types.Behavior.BLOCKING,
    parameters=_S(
        type=_T.OBJECT,
        properties={
            "passport": _S(type=_T.STRING, description="Passport country, e.g. India"),
            "destination": _S(type=_T.STRING, description="Destination country, e.g. France"),
        },
        required=["passport", "destination"],
    ),
)

REQUEST_HUMAN_HANDOFF = types.FunctionDeclaration(
    name="request_human_handoff",
    description="Connect the user with a human visa specialist. Call when they ask for a person or sound frustrated.",
    behavior=types.Behavior.NON_BLOCKING,
    parameters=_S(
        type=_T.OBJECT,
        properties={"reason": _S(type=_T.STRING, description="Why they want a human, in a few words")},
        required=["reason"],
    ),
)

LIVE_TOOLS = [types.Tool(function_declarations=[UPDATE_PROFILE, LOOKUP_VISA, REQUEST_HUMAN_HANDOFF])]

# Scheduling for each tool's FunctionResponse (blocking tools ignore it).
TOOL_SCHEDULING = {
    "update_profile": None,
    "lookup_visa": None,
    "request_human_handoff": "WHEN_IDLE",
}


async def build_system_instruction(conv) -> str:
    parts = [SYSTEM_PROMPT, LIVE_MODE_NOTE, await conv.state_block()]
    recent = conv.history[-LIVE_HISTORY_TURNS:]
    # Only once the user has spoken: before that, the only history is the
    # text greeting, and Live should open the call with its own greeting.
    if any(m.role == "user" for m in recent):
        lines = [f"{'User' if m.role == 'user' else 'Aria'}: {m.content}" for m in recent]
        parts.append(
            "## Conversation so far (continue from here; do not greet again)\n" + "\n".join(lines)
        )
    return "\n\n".join(parts)


async def build_live_config(conv, resume_handle: Optional[str] = None) -> types.LiveConnectConfig:
    return types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=types.Content(
            role="user", parts=[types.Part.from_text(text=await build_system_instruction(conv))],
        ),
        tools=LIVE_TOOLS,
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=gemini_client.LIVE_VOICE),
            ),
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        realtime_input_config=types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                disabled=False,
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                silence_duration_ms=700,
            ),
        ),
        context_window_compression=types.ContextWindowCompressionConfig(
            sliding_window=types.SlidingWindow(),
        ),
        session_resumption=types.SessionResumptionConfig(handle=resume_handle or None),
    )


async def mint_live_token(conv, resume_handle: Optional[str] = None) -> dict:
    now = dt.datetime.now(dt.timezone.utc)
    connect_by = now + TOKEN_CONNECT_WINDOW
    expires = now + TOKEN_SESSION_LIFETIME
    config = await build_live_config(conv, resume_handle)
    client = gemini_client.get_live_admin_client()
    token = await client.aio.auth_tokens.create(
        config=types.CreateAuthTokenConfig(
            uses=1,
            expire_time=expires,
            new_session_expire_time=connect_by,
            live_connect_constraints=types.LiveConnectConstraints(
                model=gemini_client.LIVE_MODEL,
                config=config,
            ),
            # lock_additional_fields left unset = the whole config is locked.
        ),
    )
    return {
        "token": token.name,
        "model": gemini_client.LIVE_MODEL,
        "voice": gemini_client.LIVE_VOICE,
        "expires_at": connect_by.isoformat().replace("+00:00", "Z"),
        "session_expires_at": expires.isoformat().replace("+00:00", "Z"),
        "api_version": gemini_client.LIVE_API_VERSION,
    }
