"""
Per-IP rate limiting via slowapi, in process memory.

It used to share the Upstash Redis instance, but slowapi has no fallback when
Redis is unreachable: once the free Upstash database was deleted, every
request failed with a 500. The backend runs as a single process, so in-memory
limits are just as accurate here.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")
