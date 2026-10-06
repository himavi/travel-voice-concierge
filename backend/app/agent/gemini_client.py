"""
One shared Google Gemini client (official `google-genai` SDK) plus the
model IDs, all overridable from the environment.

- GEMINI_TEXT_MODEL: text turns, voice-lite audio turns and handoff summaries.
- GEMINI_LIVE_MODEL: native speech-to-speech in the browser (Live API), reached
  with a short-lived ephemeral token minted by this backend.
"""

import os
from typing import Optional

from google import genai
from google.genai import errors as genai_errors

TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "gemini-3.5-flash-lite")
LIVE_MODEL = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.8-live")
LIVE_VOICE = os.getenv("LIVE_VOICE", "Aoede")

# Ephemeral tokens (auth_tokens.create) and the constrained Live endpoint
# (BidiGenerateContentConstrained) only exist on v1alpha. Verified 2026-10-06
# against gemini-3.8-live; see backend/LIVE_NOTES.md.
LIVE_API_VERSION = "v1alpha"

_client: Optional[genai.Client] = None
_live_admin_client: Optional[genai.Client] = None


def _api_key() -> str:
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return key


def get_client() -> genai.Client:
    """Default-version client for generate_content."""
    global _client
    if _client is None:
        _client = genai.Client(api_key=_api_key())
    return _client


def get_live_admin_client() -> genai.Client:
    """v1alpha client, used only to mint ephemeral Live tokens."""
    global _live_admin_client
    if _live_admin_client is None:
        _live_admin_client = genai.Client(
            api_key=_api_key(),
            http_options={"api_version": LIVE_API_VERSION},
        )
    return _live_admin_client


def is_quota_error(exc: BaseException) -> bool:
    """429 / RESOURCE_EXHAUSTED: retrying half a second later can't help."""
    return isinstance(exc, genai_errors.APIError) and getattr(exc, "code", None) == 429


def usage_dict(response) -> dict:
    """Token usage of a generate_content response, for logs."""
    um = getattr(response, "usage_metadata", None)
    if um is None:
        return {}
    return {
        "prompt_tokens": um.prompt_token_count,
        "output_tokens": um.candidates_token_count,
        "thinking_tokens": getattr(um, "thoughts_token_count", None),
        "total_tokens": um.total_token_count,
    }
