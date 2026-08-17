"""
Small, dependency-free retry helper for the handful of external calls
(Groq LLM, Groq Whisper, edge_tts) that currently have no retry/timeout
logic at all and rely purely on SDK defaults plus a blanket except-and-
fallback. One retry after a short delay is enough for the transient
blips (a dropped connection, a momentary rate-limit) this is meant to
absorb — anything failing twice in a row is a real outage the existing
graceful-fallback text should handle instead.
"""

import asyncio
import logging
from typing import Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


async def with_retries(
    coro_fn: Callable[[], Awaitable[T]],
    *,
    attempts: int = 2,
    base_delay_s: float = 0.4,
    timeout_s: float = 8.0,
    label: str = "call",
    no_retry_on: tuple[type[Exception], ...] = (),
) -> T:
    """`no_retry_on` is for errors a retry can't possibly fix — e.g. Groq's
    RateLimitError, which reports a wait time measured in minutes, so
    retrying half a second later just adds latency before the same
    graceful-fallback outcome. Fails fast on those instead."""
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return await asyncio.wait_for(coro_fn(), timeout=timeout_s)
        except no_retry_on as exc:
            logger.warning("%s hit a non-retryable error: %s", label, exc)
            raise
        except Exception as exc:
            last_exc = exc
            logger.warning(
                "%s failed on attempt %d/%d: %s", label, attempt, attempts, exc,
            )
            if attempt < attempts:
                await asyncio.sleep(base_delay_s * attempt)
    assert last_exc is not None
    raise last_exc
