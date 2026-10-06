"""
Visa lookups backed by the structured knowledge base (tools/knowledge_base.py).

Two views of the same record:
- get_visa_info(): the `VisaInfo` shape the dashboard renders.
- model_visa_payload(): what the model sees (lookup_visa tool result in Live,
  the VISA DATA note in text mode), including whether it is unverified.
"""

from typing import Optional

from app.tools.knowledge_base import is_stale, lookup as kb_lookup

_MODEL_FIELDS = (
    "visa_required", "visa_type", "processing_time", "fee",
    "validity", "notes", "documents", "source", "last_verified",
)


async def get_visa_info(passport: str, destination: str) -> dict:
    record = await kb_lookup(passport, destination)
    if record is None:
        return {
            "available": False,
            "visa_required": None,
            "verified": False,
            "notes": (
                f"No verified visa data for a {passport} passport to {destination} yet. "
                "A visa specialist can confirm the requirements."
            ),
        }
    return {
        "available": True,
        "visa_required": record["visa_required"],
        "visa_type": record.get("visa_type"),
        "processing_time": record.get("processing_time"),
        "fee": record.get("fee"),
        "validity": record.get("validity"),
        "notes": record.get("notes"),
        "documents": record.get("documents", []),
        "source": record.get("source"),
        "last_verified": record.get("last_verified"),
        "verified": not is_stale(record),
    }


def model_visa_payload(record: Optional[dict]) -> dict:
    """Trimmed record for the model; `verified` false means older than 6 months."""
    if record is None:
        return {"found": False}
    payload = {"found": True}
    payload.update({k: record.get(k) for k in _MODEL_FIELDS if record.get(k) is not None})
    payload["verified"] = not is_stale(record)
    return payload
