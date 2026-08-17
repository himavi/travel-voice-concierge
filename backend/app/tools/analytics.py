"""
Lightweight, Redis-backed analytics — plain counters/hashes, no unbounded
lists or a separate analytics DB. All functions are best-effort (never
raise) since they're only ever called from background tasks and must not
be able to affect a live conversation turn.
"""

import logging
from datetime import datetime, timezone

from app.core.redis_client import get_redis

logger = logging.getLogger(__name__)


async def _incr(key: str) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        await r.incr(key)
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        await r.incr(f"{key}:{today}")
    except Exception:
        logger.warning("Analytics increment failed for %s", key, exc_info=True)


async def record_conversation_started(session_id: str) -> None:
    await _incr("analytics:conversations:total")


async def record_profile_completed(session_id: str) -> None:
    await _incr("analytics:profiles_completed")


async def record_hot_lead(session_id: str, score: int) -> None:
    await _incr("analytics:hot_leads")


async def record_handoff(session_id: str) -> None:
    await _incr("analytics:handoffs")


async def record_latency(stage: str, ms: float) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        key = f"analytics:latency:{stage}"
        await r.hincrbyfloat(key, "sum_ms", ms)
        await r.hincrby(key, "count", 1)
    except Exception:
        logger.warning("Analytics latency recording failed for stage %s", stage, exc_info=True)


async def get_summary() -> dict:
    r = get_redis()
    if r is None:
        return {"available": False, "reason": "Redis not configured"}

    try:
        conversations = int(await r.get("analytics:conversations:total") or 0)
        profiles_completed = int(await r.get("analytics:profiles_completed") or 0)
        hot_leads = int(await r.get("analytics:hot_leads") or 0)
        handoffs = int(await r.get("analytics:handoffs") or 0)

        latency = {}
        async for key in r.scan_iter(match="analytics:latency:*"):
            stage = key.split(":", 2)[-1]
            data = await r.hgetall(key)
            count = int(data.get("count", 0))
            total_ms = float(data.get("sum_ms", 0))
            latency[stage] = {
                "count": count,
                "avg_ms": round(total_ms / count, 1) if count else 0,
            }

        return {
            "available": True,
            "conversations_started": conversations,
            "profiles_completed": profiles_completed,
            "hot_leads": hot_leads,
            "handoffs": handoffs,
            "latency_by_stage": latency,
        }
    except Exception:
        logger.warning("Analytics summary read failed", exc_info=True)
        return {"available": False, "reason": "Redis read failed"}
