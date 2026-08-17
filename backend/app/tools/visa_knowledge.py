"""
Visa/budget lookups. Backed by the structured knowledge base in
app/tools/knowledge_base.py (app/data/visa_knowledge.json) rather than the
tiny hardcoded dicts this module used to define directly.

Results are cached in Redis for 24h (`@cached`) — visa rules and geocoded
destination resolutions don't change intra-day, and this also keeps repeat
queries from re-hitting Nominatim's free geocoding service unnecessarily.
"""

from app.core.redis_client import cached
from app.tools.knowledge_base import lookup as kb_lookup


@cached(ttl=86400, prefix="visa")
async def get_visa_info(passport: str, destination: str) -> dict:
    passport = passport.strip().lower()
    destination = destination.strip().lower()

    record = await kb_lookup(passport, destination)
    if record is None:
        return {
            "visa_required": None,
            "notes": (
                f"Visa information for {passport} passport to {destination} "
                "not available. Please check the official embassy website."
            ),
        }

    return {
        "visa_required": record["visa_required"],
        "visa_type": record.get("visa_type"),
        "processing_time": record.get("processing_time"),
        "fee": record.get("fee"),
        "validity": record.get("validity"),
        "notes": record.get("notes"),
        "documents": record.get("documents", []),
        "source": record.get("source"),
        "last_verified": record.get("last_verified"),
    }


@cached(ttl=86400, prefix="budget")
async def estimate_budget(destination: str, travelers: int, days: int) -> dict:
    destination = destination.strip().lower()

    # Budget data is currently only modeled for Indian-passport corridors,
    # matching the app's existing India-centric scope.
    record = await kb_lookup("india", destination)
    if record is None:
        return {"error": f"Budget estimate not available for {destination}"}

    per_person = record["budget_per_person_per_day_inr"] * days
    total_stay = per_person * travelers
    flights = record["flight_from_india_inr"] * travelers
    visas = record["visa_fee_inr"] * travelers
    total = total_stay + flights + visas

    return {
        "destination": destination,
        "travelers": travelers,
        "days": days,
        "stay_cost_inr": total_stay,
        "flights_inr": flights,
        "visa_fees_inr": visas,
        "total_estimated_inr": total,
        "total_estimated_formatted": f"₹{total:,}",
        "currency": record["currency"],
        "note": "Estimates are approximate. Actual costs may vary.",
    }
