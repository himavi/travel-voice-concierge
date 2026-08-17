"""
Shared Redis connection (Upstash free tier) + a small caching decorator.

Every call site treats Redis as best-effort: if REDIS_URL isn't set, or the
service is briefly unreachable, callers degrade gracefully (in-memory-only
sessions, no caching, no rate limiting) rather than raising — a demo-scale
free deployment shouldn't go down because a free Redis add-on hiccuped.
"""

import functools
import json
import logging
import os
from typing import Optional

import redis.asyncio as redis

logger = logging.getLogger(__name__)

_redis: Optional[redis.Redis] = None
_redis_checked = False


def get_redis() -> Optional[redis.Redis]:
    """Returns a shared pooled Redis client, or None if REDIS_URL isn't configured."""
    global _redis, _redis_checked
    if _redis_checked:
        return _redis
    _redis_checked = True

    url = os.getenv("REDIS_URL")
    if not url:
        logger.warning("REDIS_URL not set — sessions/cache/rate-limiting will run in-memory only")
        return None

    _redis = redis.from_url(url, decode_responses=True, max_connections=10)
    return _redis


def cached(ttl: int = 86400, prefix: str = ""):
    """Caches an async function's JSON-serializable return value in Redis.
    A cache miss, a disabled/unreachable Redis, or a None result all just
    fall through to calling the wrapped function directly."""
    def decorator(fn):
        @functools.wraps(fn)
        async def wrapper(*args, **kwargs):
            r = get_redis()
            if r is None:
                return await fn(*args, **kwargs)

            key_bits = [prefix or fn.__name__] + [str(a) for a in args] + [
                f"{k}={v}" for k, v in sorted(kwargs.items())
            ]
            cache_key = "cache:" + ":".join(key_bits).lower().replace(" ", "_")

            try:
                cached_val = await r.get(cache_key)
                if cached_val is not None:
                    return json.loads(cached_val)
            except Exception:
                logger.warning("Cache read failed for %s", cache_key, exc_info=True)
                return await fn(*args, **kwargs)

            result = await fn(*args, **kwargs)

            if result is not None:
                try:
                    await r.set(cache_key, json.dumps(result), ex=ttl)
                except Exception:
                    logger.warning("Cache write failed for %s", cache_key, exc_info=True)

            return result
        return wrapper
    return decorator
