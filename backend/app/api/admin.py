"""
Admin-only aggregate analytics endpoint. Unlike the per-session endpoints in
routes.py (scoped by an unguessable session UUID, called anonymously by the
frontend), this exposes data across ALL sessions — so it's gated by a
shared-secret header instead.
"""

import os

from fastapi import APIRouter, Header, HTTPException

from app.tools.analytics import get_summary

router = APIRouter()


def _check_admin_key(x_admin_key: str | None) -> None:
    expected = os.getenv("ADMIN_API_KEY")
    if not expected or x_admin_key != expected:
        raise HTTPException(status_code=401, detail="Missing or invalid X-Admin-Key header")


@router.get("/api/admin/analytics")
async def get_analytics(x_admin_key: str | None = Header(default=None)):
    _check_admin_key(x_admin_key)
    return await get_summary()
