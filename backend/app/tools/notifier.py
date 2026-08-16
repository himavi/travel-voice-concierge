"""
Sends an instant Telegram push notification to the business owner when a
lead crosses the hot-lead threshold. Uses the free Telegram Bot API instead
of a paid telephony service — zero ongoing cost.
"""

import logging
import os

import httpx

from app.models.schemas import CustomerProfile

logger = logging.getLogger(__name__)

TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/sendMessage"


def _format_lead_alert(profile: CustomerProfile) -> str:
    """Format profile fields directly — no LLM call, so this stays instant."""
    lines = [f"\U0001F525 Hot Lead Alert — score {profile.lead_score}/100"]
    if profile.customer_name:
        lines.append(f"Name: {profile.customer_name}")
    if profile.destination:
        lines.append(f"Destination: {profile.destination}")
    if profile.passport:
        lines.append(f"Passport: {profile.passport}")
    if profile.purpose:
        lines.append(f"Purpose: {profile.purpose}")
    if profile.budget:
        lines.append(f"Budget: {profile.budget}")
    lines.append(f"\nSession: {profile.session_id}")
    return "\n".join(lines)


async def send_lead_alert(profile: CustomerProfile) -> None:
    """Best-effort push notification. Never raises — a failure here must
    not break the conversation turn."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        logger.warning(
            "Skipping lead alert for session %s: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not configured",
            profile.session_id,
        )
        return

    text = _format_lead_alert(profile)
    url = TELEGRAM_API_URL.format(token=token)

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(url, json={"chat_id": chat_id, "text": text})
            resp.raise_for_status()
    except Exception:
        logger.exception("Failed to send Telegram lead alert for session %s", profile.session_id)
