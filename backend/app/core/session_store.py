"""
Redis-backed session store. Render's free tier spins down on idle and wipes
whatever's in process memory — this is what makes a conversation survive
that instead of vanishing.

Falls back to in-process-only storage automatically whenever Redis is
unset/unreachable (get_redis() returns None) — the app still works locally
without an Upstash instance, it just loses persistence across restarts.
"""

import json
import logging
from typing import Optional

from app.agent.conversation import ConversationManager
from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)

# Sliding TTL — refreshed on every save(), so an active conversation never
# expires mid-use but an abandoned one is cleaned up automatically.
SESSION_TTL_SECONDS = 1800  # 30 minutes


class SessionStore:
    def __init__(self):
        self._cache: dict[str, ConversationManager] = {}

    async def create(self, session_id: str) -> ConversationManager:
        conv = ConversationManager(session_id)
        self._cache[session_id] = conv
        await self.save(session_id, conv)
        return conv

    async def get(self, session_id: str) -> Optional[ConversationManager]:
        if session_id in self._cache:
            return self._cache[session_id]

        r = get_redis()
        if r is None:
            return None

        try:
            raw = await r.get(f"session:{session_id}")
        except Exception:
            logger.warning("Redis unavailable reading session %s", session_id, exc_info=True)
            return None

        if raw is None:
            return None

        conv = ConversationManager.from_state(session_id, json.loads(raw))
        self._cache[session_id] = conv
        return conv

    async def save(self, session_id: str, conv: ConversationManager) -> None:
        self._cache[session_id] = conv

        r = get_redis()
        if r is None:
            return

        try:
            await r.set(f"session:{session_id}", json.dumps(conv.to_state()), ex=SESSION_TTL_SECONDS)
        except Exception:
            logger.warning("Redis unavailable saving session %s — kept in-process only", session_id, exc_info=True)


session_store = SessionStore()
