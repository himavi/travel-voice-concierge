"""
Session store.

On Vercel the API runs as serverless functions: consecutive requests from one
conversation can land on different instances that share no memory. So when
ARIA_TURSO_URL / ARIA_TURSO_TOKEN are set, every session is persisted to a
Turso (hosted SQLite) table through its HTTP API and loaded on each request.
Without them (local dev, tests) sessions live only in process memory.

Either way sessions expire after 30 minutes without activity. The frontend
serialises requests per session, so last-write-wins saves are safe; if a
session is gone it recreates it with `seed_profile` + `history` (docs/API.md).
"""

import json
import logging
import os
import time
from collections import OrderedDict
from typing import Optional

import httpx

from app.agent.conversation import ConversationManager

logger = logging.getLogger(__name__)

SESSION_TTL_SECONDS = 30 * 60
MAX_SESSIONS = 500


class SessionStore:
    def __init__(self, ttl_seconds: int = SESSION_TTL_SECONDS, max_sessions: int = MAX_SESSIONS):
        self.ttl = ttl_seconds
        self.max_sessions = max_sessions
        # In-memory mode: session_id -> (conversation, last access time); oldest first.
        self._items: "OrderedDict[str, tuple[ConversationManager, float]]" = OrderedDict()
        url = os.getenv("ARIA_TURSO_URL", "").replace("libsql://", "https://").rstrip("/")
        token = os.getenv("ARIA_TURSO_TOKEN", "")
        self._turso = (url, token) if url and token else None
        self._http: Optional[httpx.AsyncClient] = None

    # ─── Turso (HTTP pipeline API) ──────────────────────────────────────────

    async def _execute(self, sql: str, args: list) -> list[list]:
        url, token = self._turso
        if self._http is None:
            self._http = httpx.AsyncClient(timeout=8.0)
        typed = [
            {"type": "integer", "value": str(a)} if isinstance(a, int) else {"type": "text", "value": a}
            for a in args
        ]
        res = await self._http.post(
            f"{url}/v2/pipeline",
            headers={"Authorization": f"Bearer {token}"},
            json={"requests": [{"type": "execute", "stmt": {"sql": sql, "args": typed}}, {"type": "close"}]},
        )
        res.raise_for_status()
        result = res.json()["results"][0]
        if result["type"] != "ok":
            raise RuntimeError(f"Turso error: {result.get('error')}")
        return [[col["value"] for col in row] for row in result["response"]["result"]["rows"]]

    # ─── Public API ─────────────────────────────────────────────────────────

    async def create(self, session_id: str) -> ConversationManager:
        conv = ConversationManager(session_id)
        if self._turso:
            # Opportunistic cleanup keeps the table small without a cron job.
            await self._execute("DELETE FROM sessions WHERE updated_at < ?", [int(time.time()) - self.ttl])
            await self.save(conv)
            return conv
        now = time.monotonic()
        self._purge(now)
        while len(self._items) >= self.max_sessions:
            self._items.popitem(last=False)  # evict least recently used
        self._items[session_id] = (conv, now)
        return conv

    async def get(self, session_id: str) -> Optional[ConversationManager]:
        if self._turso:
            rows = await self._execute(
                "SELECT state FROM sessions WHERE id = ? AND updated_at >= ?",
                [session_id, int(time.time()) - self.ttl],
            )
            return ConversationManager.from_state(session_id, json.loads(rows[0][0])) if rows else None
        now = time.monotonic()
        item = self._items.get(session_id)
        if item is None:
            return None
        conv, seen = item
        if now - seen > self.ttl:
            self._items.pop(session_id, None)
            return None
        self._items[session_id] = (conv, now)  # slide the TTL
        self._items.move_to_end(session_id)
        return conv

    async def save(self, conv: ConversationManager) -> None:
        """Persist after any change. A no-op in memory mode (objects are shared)."""
        if not self._turso:
            return
        await self._execute(
            "INSERT INTO sessions (id, state, updated_at) VALUES (?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at",
            [conv.session_id, json.dumps(conv.to_state()), int(time.time())],
        )

    def _purge(self, now: float) -> None:
        while self._items:
            sid, (_, seen) = next(iter(self._items.items()))
            if now - seen <= self.ttl:
                break
            self._items.pop(sid)

    def __len__(self) -> int:
        return len(self._items)


session_store = SessionStore()
