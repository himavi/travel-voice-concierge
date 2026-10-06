import asyncio
import contextlib
import logging
import os

from dotenv import load_dotenv

load_dotenv()

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.logging_config import configure_logging
from app.core.rate_limit import limiter, rate_limit_handler
from app.api.routes import router
from app.api.admin import router as admin_router

configure_logging()
logger = logging.getLogger(__name__)

KEEP_AWAKE_INTERVAL_S = 10 * 60


def _public_base_url() -> str | None:
    """Own public URL on Hugging Face Spaces (SPACE_HOST) or Render."""
    space_host = os.getenv("SPACE_HOST")
    if space_host:
        return f"https://{space_host}"
    return os.getenv("RENDER_EXTERNAL_URL") or None


async def _keep_awake(url: str) -> None:
    """Ping our own /health through the public URL so the host sees traffic."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            await asyncio.sleep(KEEP_AWAKE_INTERVAL_S)
            try:
                await client.get(f"{url}/health")
            except Exception as exc:
                logger.warning("keep-awake ping failed: %s", type(exc).__name__)


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    task = None
    base = _public_base_url()
    if base:
        task = asyncio.create_task(_keep_awake(base.rstrip("/")))
        logger.info("keep-awake enabled", extra={"url": base})
    try:
        yield
    finally:
        if task:
            task.cancel()


app = FastAPI(
    title="Aria travel voice concierge API",
    description="Backend for Aria, a personal-project voice travel and visa concierge (Gemini).",
    version="2.0.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.add_middleware(SlowAPIMiddleware)

# Local dev origins always allowed; production origins (e.g. the Vercel URL)
# come from ALLOWED_ORIGINS (comma-separated).
_default_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3002",
]
_extra_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(admin_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
