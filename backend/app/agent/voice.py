"""
Text-to-speech for text and voice-lite modes (edge-tts, free).

The whole reply is synthesized as ONE MP3 clip and returned in the REST
response, so sentences can't arrive or play out of order. Speech-to-text is
no longer done here: voice-lite sends the WAV straight to Gemini Flash-Lite,
which transcribes and replies in one call (agent/conversation.py).
"""

import logging
import re
from typing import Optional

import edge_tts

from app.core.retry import with_retries

logger = logging.getLogger(__name__)

DEFAULT_VOICE = "en-US-AriaNeural"
# A multilingual voice for languages without a dedicated entry below.
MULTILINGUAL_VOICE = "en-US-AvaMultilingualNeural"
TTS_RATE = "+0%"
TTS_PITCH = "+0Hz"

# Aria replies in the user's language; pick a native voice when we have one.
_VOICES_BY_LANGUAGE = {
    "en": DEFAULT_VOICE,
    "hi": "hi-IN-SwaraNeural",
    "es": "es-ES-ElviraNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "it": "it-IT-ElsaNeural",
    "pt": "pt-BR-FranciscaNeural",
    "ja": "ja-JP-NanamiNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ar": "ar-AE-FatimaNeural",
    "ta": "ta-IN-PallaviNeural",
    "te": "te-IN-ShrutiNeural",
    "bn": "bn-IN-TanishaaNeural",
    "mr": "mr-IN-AarohiNeural",
    "gu": "gu-IN-DhwaniNeural",
    "kn": "kn-IN-SapnaNeural",
    "ml": "ml-IN-SobhanaNeural",
    "ur": "ur-PK-UzmaNeural",
}

MAX_TTS_CHARS = 1500


def voice_for_language(language: Optional[str]) -> str:
    if not language:
        return DEFAULT_VOICE
    base = language.strip().lower().replace("_", "-").split("-")[0]
    return _VOICES_BY_LANGUAGE.get(base, MULTILINGUAL_VOICE)

# Edge TTS narrates emoji by their alt-text ("glowing star") instead of
# skipping them, which reads as broken speech. Strip them for the audio
# path only — the transcript sent to the dashboard keeps the emoji.
_EMOJI_PATTERN = re.compile(
    "["
    "\U0001F300-\U0001FAFF"  # symbols & pictographs (incl. supplemental, extended-A)
    "\U00002600-\U000027BF"  # misc symbols & dingbats
    "\U0001F1E6-\U0001F1FF"  # regional indicator flags
    "\U00002B00-\U00002BFF"  # misc symbols and arrows
    "\U0001F000-\U0001F0FF"  # mahjong/dominoes/playing cards
    "\U00002300-\U000023FF"  # misc technical (hourglass, watch, etc.)
    "\U0000FE0F"              # variation selector-16
    "\U0000200D"              # zero-width joiner
    "]+"
)


def _strip_emoji(text: str) -> str:
    return _EMOJI_PATTERN.sub("", text)


# Markdown the LLM sometimes emits gets read aloud literally by edge_tts
# ("asterisk", "pound sign") instead of being treated as formatting.
_BOLD_ITALIC_PATTERN = re.compile(r"\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|(?<!\w)_(.+?)_(?!\w)")
_INLINE_CODE_PATTERN = re.compile(r"`([^`]+)`")
_HEADING_PATTERN = re.compile(r"(?m)^\s{0,3}#{1,6}\s+")
_BULLET_PATTERN = re.compile(r"(?m)^\s{0,3}[-*+]\s+")


def _strip_markdown(text: str) -> str:
    text = _BOLD_ITALIC_PATTERN.sub(lambda m: next(g for g in m.groups() if g is not None), text)
    text = _INLINE_CODE_PATTERN.sub(r"\1", text)
    text = _HEADING_PATTERN.sub("", text)
    text = _BULLET_PATTERN.sub("", text)
    # Anything left unpaired (a stray "*" the LLM didn't close, etc.)
    return text.replace("*", "").replace("`", "").replace("_", " ")


# A bare hyphenated number pair ("3000-5000") reads as a serial code, not a
# range — say it as one. A bare 4+ digit run ("50000") gets read digit by
# digit; thousands separators are what the TTS normalizer expects in order
# to say "fifty thousand" instead.
_NUMBER_RANGE_PATTERN = re.compile(r"(?<=\d)\s*-\s*(?=\d)")
_LARGE_NUMBER_PATTERN = re.compile(r"\b\d{4,}\b")


def _format_large_number(match: "re.Match[str]") -> str:
    n = int(match.group())
    if 1900 <= n <= 2099:  # plausible calendar year — leave as-is
        return match.group()
    return f"{n:,}"


def _speakify_numbers(text: str) -> str:
    text = _NUMBER_RANGE_PATTERN.sub(" to ", text)
    return _LARGE_NUMBER_PATTERN.sub(_format_large_number, text)


def _prepare_for_speech(text: str) -> str:
    cleaned = _strip_emoji(text)
    cleaned = _strip_markdown(cleaned)
    cleaned = _speakify_numbers(cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    # If cleaning collapsed everything to nothing (an emoji-only reply, say),
    # speaking the original text is better than handing edge_tts empty input.
    return cleaned or text


async def synthesize_speech(text: str, language: Optional[str] = None) -> bytes:
    """Whole reply -> one MP3 (bytes)."""
    voice = voice_for_language(language)

    async def _call():
        communicate = edge_tts.Communicate(
            text=_prepare_for_speech(text)[:MAX_TTS_CHARS],
            voice=voice,
            rate=TTS_RATE,
            pitch=TTS_PITCH,
        )
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        return b"".join(audio_chunks)

    return await with_retries(_call, label="tts", timeout_s=15.0)
