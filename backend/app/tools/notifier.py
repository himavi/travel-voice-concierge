"""
Telegram push notifications to the owner (free Telegram Bot API):
- a hot-lead alert when a lead crosses the score threshold;
- a handoff alert when a customer asks for a human.
"""

import logging
import os

import httpx

from app.models.schemas import CustomerProfile, HandoffCard

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


def _format_handoff_alert(profile: CustomerProfile, card: HandoffCard) -> str:
    lines = [f"\U0001F64B Handoff requested — score {profile.lead_score}/100"]
    if card.reason:
        lines.append(f"Reason: {card.reason}")
    for label, value in (
        ("Name", profile.customer_name),
        ("Destination", profile.destination),
        ("Passport", profile.passport),
        ("Purpose", profile.purpose),
        ("When", profile.travel_dates or profile.travel_month),
        ("Travelers", profile.travelers),
    ):
        if value:
            lines.append(f"{label}: {value}")
    if card.conversation_summary:
        lines.append(f"\n{card.conversation_summary}")
    lines.append(f"\nSession: {profile.session_id}")
    return "\n".join(lines)


async def _send(text: str, session_id: str, kind: str) -> None:
    """Best-effort. Never raises: a failure here must not break a turn."""
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        logger.warning(
            "Skipping %s alert for session %s: TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not configured",
            kind, session_id,
        )
        return
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(TELEGRAM_API_URL.format(token=token), json={"chat_id": chat_id, "text": text})
            resp.raise_for_status()
    except Exception:
        # Don't log the exception text: httpx errors include the URL, which
        # contains the bot token.
        logger.warning("Failed to send Telegram %s alert for session %s", kind, session_id)


async def send_lead_alert(profile: CustomerProfile) -> None:
    await _send(_format_lead_alert(profile), profile.session_id, "lead")


async def send_handoff_alert(profile: CustomerProfile, card: HandoffCard) -> None:
    await _send(_format_handoff_alert(profile, card), profile.session_id, "handoff")
