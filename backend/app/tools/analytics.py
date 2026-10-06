"""
Lightweight in-process analytics: counters (all-time and per UTC day) and
latency sums per stage. Reset on restart, which is fine for a single-process
hobby deployment. Every function is best-effort and never raises, since they
only run in background tasks and must not affect a conversation turn.
"""

import logging
from collections import defaultdict
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_counters: dict[str, int] = defaultdict(int)
_daily: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
_latency: dict[str, dict[str, float]] = defaultdict(lambda: {"sum_ms": 0.0, "count": 0})
_started_at = datetime.now(timezone.utc)

_MAX_DAYS_KEPT = 30


def _incr(key: str) -> None:
    try:
        _counters[key] += 1
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        _daily[today][key] += 1
        while len(_daily) > _MAX_DAYS_KEPT:
            _daily.pop(min(_daily))
    except Exception:
        logger.warning("Analytics increment failed for %s", key, exc_info=True)


async def record_conversation_started(session_id: str) -> None:
    _incr("conversations")


async def record_profile_completed(session_id: str) -> None:
    _incr("profiles_completed")


async def record_hot_lead(session_id: str, score: int) -> None:
    _incr("hot_leads")


async def record_handoff(session_id: str) -> None:
    _incr("handoffs")


async def record_live_token(session_id: str) -> None:
    _incr("live_tokens")


async def record_latency(stage: str, ms: float) -> None:
    try:
        bucket = _latency[stage]
        bucket["sum_ms"] += ms
        bucket["count"] += 1
    except Exception:
        logger.warning("Analytics latency recording failed for stage %s", stage, exc_info=True)


async def get_summary() -> dict:
    return {
        "available": True,
        "since": _started_at.isoformat(),
        "conversations_started": _counters["conversations"],
        "profiles_completed": _counters["profiles_completed"],
        "hot_leads": _counters["hot_leads"],
        "handoffs": _counters["handoffs"],
        "live_tokens_issued": _counters["live_tokens"],
        "by_day": {day: dict(counts) for day, counts in sorted(_daily.items())},
        "latency_by_stage": {
            stage: {
                "count": int(v["count"]),
                "avg_ms": round(v["sum_ms"] / v["count"], 1) if v["count"] else 0,
            }
            for stage, v in _latency.items()
        },
    }
