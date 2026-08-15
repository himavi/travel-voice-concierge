"""
Manages active WebSocket connections per session.
Handles sending typed messages to the frontend.
"""

import json
from datetime import datetime
from typing import Dict
from fastapi import WebSocket


def _serialize(obj):
    """JSON serializer that handles datetime objects."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


class ConnectionManager:
    def __init__(self):
        # session_id -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        self.active_connections.pop(session_id, None)

    async def send(self, session_id: str, message_type: str, data: dict):
        websocket = self.active_connections.get(session_id)
        if not websocket:
            return
        payload = {
            "type": message_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat(),
        }
        await websocket.send_text(json.dumps(payload, default=_serialize))

    async def send_transcript(self, session_id: str, role: str, text: str):
        await self.send(session_id, "transcript", {"role": role, "text": text})

    async def send_profile_update(self, session_id: str, profile: dict):
        await self.send(session_id, "profile_update", profile)

    async def send_decision_event(self, session_id: str, event: dict):
        await self.send(session_id, "decision_event", event)

    async def send_audio(self, session_id: str, audio_b64: str):
        await self.send(session_id, "audio_chunk", {"audio": audio_b64})

    async def send_handoff(self, session_id: str, handoff_card: dict):
        await self.send(session_id, "handoff", handoff_card)

    async def send_error(self, session_id: str, error: str):
        await self.send(session_id, "error", {"message": error})

    async def send_status(self, session_id: str, status: str):
        """status: 'listening' | 'thinking' | 'speaking' | 'idle'"""
        await self.send(session_id, "status", {"status": status})


# Singleton instance
manager = ConnectionManager()
