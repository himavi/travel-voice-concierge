"""
Per-IP rate limiting via slowapi, in process memory (single process; no
Redis). Limits per route are in app/api/routes.py (docs/API.md). A 429 body
is always {"detail": "busy"}.

Behind the Hugging Face Spaces proxy every request arrives from the proxy's
address, so the client IP is the right-most X-Forwarded-For entry (the one
the proxy itself appended; entries to its left are client-supplied).
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        last = forwarded.split(",")[-1].strip()
        if last:
            return last
    return get_remote_address(request)


limiter = Limiter(key_func=client_ip, storage_uri="memory://")


async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(status_code=429, content={"detail": "busy"})
