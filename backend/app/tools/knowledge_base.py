"""
Structured visa knowledge base: loads app/data/visa_knowledge.json once and
resolves (passport, destination) pairs with exact and alias matching only.

There is deliberately no fuzzy string matching: WRatio-style scoring mapped
"Ukraine" onto the UK record, i.e. it confidently answered a different
country's visa rules. A miss here is safe (the assistant says it has no
verified data and offers a specialist); a wrong hit is not.

Resolution order for the destination:
  1. a record's destination_key or one of its aliases (case-insensitive);
  2. Schengen member countries fall back to the passport's "schengen" record;
  3. the geocoder (tools/geo.py), which normalizes cities and alternate
     country names ("Paris" -> france), then steps 1-2 again on its answer.

Records carry a `last_verified` date. Anything older than STALE_AFTER_DAYS
is reported as unverified, so the assistant tells the user the details may
have changed and offers a specialist instead of presenting them as current.
The records are curated by hand; nothing here can auto-verify embassy data.
"""

import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from app.tools.geo import SCHENGEN_COUNTRIES, resolve_destination_key

logger = logging.getLogger(__name__)

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "visa_knowledge.json"

STALE_AFTER_DAYS = 183  # ~6 months

# Common ways people name a passport/nationality -> the passport key used in
# the records.
_PASSPORT_ALIASES = {
    "indian": "india",
    "india": "india",
    "bharat": "india",
}

with open(_DATA_PATH, "r", encoding="utf-8") as f:
    _RECORDS: list[dict] = json.load(f)

# (passport, destination_key) -> record
_BY_KEY: dict[tuple[str, str], dict] = {
    (r["passport"], r["destination_key"]): r for r in _RECORDS
}

# (passport, alias) -> destination_key
_ALIAS_INDEX: dict[tuple[str, str], str] = {}
for _r in _RECORDS:
    for _alias in [_r["destination_key"], *_r.get("aliases", [])]:
        _ALIAS_INDEX[(_r["passport"], _alias.strip().lower())] = _r["destination_key"]


def _norm(text: str) -> str:
    text = " ".join(text.strip().lower().replace(".", "").split())
    if text.startswith("the "):
        text = text[4:]
    return text


def normalize_passport(passport: str) -> str:
    p = _norm(passport)
    for suffix in (" passport", " passports", " citizen", " citizens", " national", " nationals"):
        if p.endswith(suffix):
            p = p[: -len(suffix)]
    return _PASSPORT_ALIASES.get(p, p)


def _lookup_exact(passport: str, destination: str) -> Optional[dict]:
    key = _ALIAS_INDEX.get((passport, destination))
    if key is not None:
        return _BY_KEY.get((passport, key))
    if destination in SCHENGEN_COUNTRIES:
        return _BY_KEY.get((passport, "schengen"))
    return None


def is_stale(record: dict, today: Optional[date] = None) -> bool:
    raw = record.get("last_verified")
    if not raw:
        return True
    try:
        verified_on = datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError:
        return True
    today = today or datetime.now(timezone.utc).date()
    return (today - verified_on).days > STALE_AFTER_DAYS


async def lookup(passport: str, destination: str) -> Optional[dict]:
    """Returns the knowledge-base record for this corridor, or None.
    Callers must not fabricate an answer when this returns None."""
    if not passport or not destination:
        return None
    passport_key = normalize_passport(passport)
    dest = _norm(destination)

    record = _lookup_exact(passport_key, dest)
    if record is not None:
        return record

    resolved = await resolve_destination_key(dest)
    if resolved and resolved != dest:
        return _lookup_exact(passport_key, resolved)
    return None
