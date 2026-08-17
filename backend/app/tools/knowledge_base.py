"""
Structured visa knowledge base — loads app/data/visa_knowledge.json once
and provides exact + alias + fuzzy retrieval over it.

NOTE: the records in visa_knowledge.json are curated example content
(source URLs + last_verified dates included per record), not scraped from
a live feed — nothing in this free-tier stack can auto-verify current
embassy/government data. Keeping them accurate over time is a manual task.

No embeddings/vector search — this is small structured data (a handful of
passport/destination corridors), not unstructured documents, so exact-match
plus a lightweight fuzzy fallback (rapidfuzz) is the right amount of
"retrieval" here rather than standing up a vector DB for it.
"""

import json
import logging
from pathlib import Path
from typing import Optional

from rapidfuzz import process, fuzz

from app.tools.geo import SCHENGEN_COUNTRIES, resolve_destination_key

logger = logging.getLogger(__name__)

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "visa_knowledge.json"

with open(_DATA_PATH, "r", encoding="utf-8") as f:
    _RECORDS: list[dict] = json.load(f)

# (passport, destination_key) -> record
_BY_KEY: dict[tuple[str, str], dict] = {
    (r["passport"], r["destination_key"]): r for r in _RECORDS
}

# alias string -> (passport, destination_key), for fuzzy matching
_ALIAS_INDEX: dict[str, tuple[str, str]] = {}
for r in _RECORDS:
    for alias in r.get("aliases", [r["destination_key"]]):
        _ALIAS_INDEX[alias.lower()] = (r["passport"], r["destination_key"])

_ALL_ALIASES = list(_ALIAS_INDEX.keys())


def _lookup_exact(passport: str, destination: str) -> Optional[dict]:
    record = _BY_KEY.get((passport, destination))
    if record is not None:
        return record
    if passport == "india" and destination in SCHENGEN_COUNTRIES:
        return _BY_KEY.get(("india", "schengen"))
    return None


async def lookup(passport: str, destination: str) -> Optional[dict]:
    """Resolves a (passport, destination) pair to a knowledge-base record.
    Tries, in order: exact key match -> geocoded/alias resolution -> fuzzy
    string match on known aliases (catches typos). Returns None if nothing
    reasonably matches — callers must not fabricate an answer in that case."""
    passport = passport.strip().lower()
    destination = destination.strip().lower()

    record = _lookup_exact(passport, destination)
    if record is not None:
        return record

    resolved = await resolve_destination_key(destination)
    if resolved:
        record = _lookup_exact(passport, resolved)
        if record is not None:
            return record

    match = process.extractOne(destination, _ALL_ALIASES, scorer=fuzz.WRatio, score_cutoff=80)
    if match:
        alias, _score, _idx = match
        fuzzy_passport, fuzzy_key = _ALIAS_INDEX[alias]
        if fuzzy_passport == passport:
            return _BY_KEY.get((fuzzy_passport, fuzzy_key))

    return None
