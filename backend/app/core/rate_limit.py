"""
Per-IP rate limiting via slowapi, backed by the same Redis instance used
for sessions/caching (no second piece of infra). Falls back to slowapi's
in-memory storage if REDIS_URL isn't set — still useful locally, just not
shared across multiple processes.
"""

import os

from slowapi import Limiter
from slowapi.util import get_remote_address

_redis_url = os.getenv("REDIS_URL")

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=_redis_url if _redis_url else "memory://",
)
