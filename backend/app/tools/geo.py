"""
Destination resolution.

Resolves free-text destinations (regions, cities, alternate country names)
into the short lowercase keys visa_knowledge.py's lookup tables use ("uk",
"usa", "uae", "schengen", or plain country names like "france").

Two-tier strategy:
  1. REGION_ALIASES — cheap, offline lookup for multi-country regions that
     geocoding cannot correctly resolve to a single country. E.g. "the Alps"
     spans Austria, France, Germany, Italy, Liechtenstein, Monaco, Slovenia
     and Switzerland — a live Nominatim query for "Alps" returns country
     "Italia" only, which would silently be wrong for most travelers.
  2. Nominatim geocoding — for legitimate single-place normalization (a city
     name, or a country's full/alternate name), mapped through
     COUNTRY_NAME_ALIASES.

Must never raise — this sits in a request path and any failure should
degrade to the caller's existing "not available" behavior.
"""

import asyncio
import logging
from dataclasses import dataclass, field

from geopy.exc import GeopyError
from geopy.geocoders import Nominatim

logger = logging.getLogger(__name__)


@dataclass
class DestinationResolution:
    key: str | None
    ambiguous: bool = False
    candidates: list[str] = field(default_factory=list)


REGION_ALIASES = {
    "alps": "schengen",
    "the alps": "schengen",
    "european alps": "schengen",
    "schengen area": "schengen",
    "schengen zone": "schengen",
}

COUNTRY_NAME_ALIASES = {
    "united kingdom": "uk",
    "great britain": "uk",
    "england": "uk",
    "united states": "usa",
    "united states of america": "usa",
    "america": "usa",
    "united arab emirates": "uae",
}

# Canonical list — visa_knowledge.py imports this rather than keeping its
# own copy, since "is this country in Schengen" is fundamentally a geo fact.
SCHENGEN_COUNTRIES = [
    "france", "germany", "italy", "spain", "netherlands",
    "portugal", "austria", "switzerland", "greece", "belgium",
    "sweden", "norway", "denmark", "finland", "czech republic",
    "poland", "hungary", "croatia", "slovenia", "slovakia",
]

_geolocator = Nominatim(user_agent="atlys-voice-agent-visa-concierge")


def _normalize_raw(raw: str) -> str:
    text = raw.strip().lower()
    if text.startswith("the "):
        text = text[4:]
    return text


def _geocode_sync(query: str):
    return _geolocator.geocode(query, addressdetails=True, timeout=5, language="en")


def _geocode_many_sync(query: str, limit: int):
    return _geolocator.geocode(
        query, addressdetails=True, timeout=5, language="en", exactly_one=False, limit=limit,
    )


def _country_key(location) -> str | None:
    country = location.raw.get("address", {}).get("country")
    if not country:
        return None
    country = country.strip().lower()
    return COUNTRY_NAME_ALIASES.get(country, country)


async def resolve_destination(raw: str) -> DestinationResolution:
    """Resolves free-text destination to a canonical key, detecting genuine
    multi-country ambiguity (e.g. a landmark/region not in REGION_ALIASES
    that spans several non-Schengen-bucketable countries) instead of
    silently picking one. Never raises — a failure just resolves to
    key=None, ambiguous=False."""
    if not raw:
        return DestinationResolution(key=None)

    normalized = _normalize_raw(raw)

    # A REGION_ALIASES hit is never ambiguous — it's exactly what already
    # correctly buckets "the Alps" -> schengen without a live geocode call.
    if normalized in REGION_ALIASES:
        return DestinationResolution(key=REGION_ALIASES[normalized])

    try:
        locations = await asyncio.to_thread(_geocode_many_sync, normalized, 5)
    except (GeopyError, Exception):
        logger.warning("Geocoding failed for destination %r", raw, exc_info=True)
        return DestinationResolution(key=None)

    if not locations:
        return DestinationResolution(key=None)

    countries = []
    for loc in locations:
        key = _country_key(loc)
        if key and key not in countries:
            countries.append(key)

    if len(countries) <= 1:
        return DestinationResolution(key=countries[0] if countries else None)

    # Multiple distinct countries — but if they're all Schengen members,
    # that's still a resolved answer (the "schengen" bucket), not something
    # to ask the customer to disambiguate.
    if all(c in SCHENGEN_COUNTRIES for c in countries):
        return DestinationResolution(key="schengen")

    return DestinationResolution(key=None, ambiguous=True, candidates=countries)


async def resolve_destination_key(raw: str) -> str | None:
    """Best-effort resolution of free-text destination to a canonical key.
    Returns None if it can't be resolved or is ambiguous — never raises."""
    return (await resolve_destination(raw)).key


_DISPLAY_OVERRIDES = {"usa": "USA", "uk": "UK", "uae": "UAE"}


def display_country(key: str) -> str:
    """Human-readable form of a canonical key, for surfacing in prompts/UI
    text (e.g. clarification questions) — "usa".title() would read "Usa"."""
    return _DISPLAY_OVERRIDES.get(key, key.title())
