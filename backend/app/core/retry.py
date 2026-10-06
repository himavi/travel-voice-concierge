"""
Small retry helper for external calls (Gemini, edge-tts). One retry after a
short delay absorbs transient blips (a dropped connection, a 5xx); anything
failing twice in a row is a real outage the caller's graceful fallback
handles instead.
"""

import asyncio
import logging
from typing import Awaitable, Callable, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


async def with_retries(
    coro_fn: Callable[[], Awaitable[T]],
    *,
    attempts: int = 2,
    base_delay_s: float = 0.4,
    timeout_s: float = 8.0,
    label: str = "call",
    give_up_on: Optional[Callable[[BaseException], bool]] = None,
) -> T:
    """`give_up_on(exc)` returning True re-raises immediately: for errors a
    retry can't fix, like a 429 quota error whose window is a minute or a day."""
    last_exc: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            return await asyncio.wait_for(coro_fn(), timeout=timeout_s)
        except Exception as exc:
            if give_up_on is not None and give_up_on(exc):
                logger.warning("%s hit a non-retryable error: %s", label, type(exc).__name__)
                raise
            last_exc = exc
            logger.warning("%s failed on attempt %d/%d: %s", label, attempt, attempts, exc)
            if attempt < attempts:
                await asyncio.sleep(base_delay_s * attempt)
    assert last_exc is not None
    raise last_exc
