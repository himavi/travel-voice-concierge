import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ.setdefault("GEMINI_API_KEY", "test-key-not-used")

from app.tools import geo  # noqa: E402
from app.tools.geo import DestinationResolution  # noqa: E402

# Offline stand-in for the Nominatim geocoder.
FAKE_GEOCODER = {
    "paris": DestinationResolution(key="france"),
    "japan": DestinationResolution(key="japan"),
    "ukraine": DestinationResolution(key="ukraine"),
    "georgia": DestinationResolution(key=None, ambiguous=True, candidates=["georgia", "usa"]),
}


@pytest.fixture(autouse=True)
def offline_geocoder(monkeypatch):
    async def fake(raw, normalized):
        return FAKE_GEOCODER.get(normalized, DestinationResolution(key=None))

    monkeypatch.setattr(geo, "_resolve_with_geocoder", fake)
    geo._RESOLUTION_CACHE.clear()
    yield


@pytest.fixture(autouse=True)
def reset_rate_limits():
    from app.core.rate_limit import limiter
    limiter.reset()
    yield
