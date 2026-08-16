"""
Voice handling: Groq Whisper for STT, Edge TTS for TTS.
"""

import os
import io
import re
import tempfile
import asyncio
import aiofiles
import edge_tts
from groq import AsyncGroq
from dotenv import load_dotenv

load_dotenv()

# Edge TTS voice — "en-US-AriaNeural" sounds warm and natural
TTS_VOICE = "en-US-AriaNeural"
TTS_RATE = "+0%"    # normal speed
TTS_PITCH = "+0Hz"  # natural pitch

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


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe audio using Groq's Whisper API.
    Returns the transcribed text.
    """
    client = AsyncGroq(api_key=os.getenv("GROQ_API_KEY"))

    suffix = os.path.splitext(filename)[-1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        async with aiofiles.open(tmp_path, "rb") as f:
            audio_data = await f.read()

        print(f"[STT] Audio size: {len(audio_data)} bytes, filename: {filename}")

        # Determine content type
        if suffix == ".ogg":
            content_type = "audio/ogg"
        elif suffix == ".mp4":
            content_type = "audio/mp4"
        elif suffix == ".wav":
            content_type = "audio/wav"
        else:
            content_type = "audio/webm"

        transcription = await client.audio.transcriptions.create(
            file=(filename, audio_data, content_type),
            model="whisper-large-v3-turbo",  # faster + just as accurate
            language="en",
            response_format="text",
        )
        
        result = transcription.strip() if isinstance(transcription, str) else transcription.text.strip()
        print(f"[STT] Transcription result: '{result}'")
        return result
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


async def synthesize_speech(text: str) -> bytes:
    """
    Convert text to speech using Edge TTS.
    Returns MP3 audio bytes.
    """
    communicate = edge_tts.Communicate(
        text=_prepare_for_speech(text),
        voice=TTS_VOICE,
        rate=TTS_RATE,
        pitch=TTS_PITCH,
    )

    audio_chunks = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_chunks.append(chunk["data"])

    return b"".join(audio_chunks)


async def synthesize_speech_streaming(text: str):
    """
    Generator that yields audio chunks as they're produced.
    Use this for lower latency — start playing before full synthesis.
    """
    communicate = edge_tts.Communicate(
        text=_prepare_for_speech(text),
        voice=TTS_VOICE,
        rate=TTS_RATE,
        pitch=TTS_PITCH,
    )

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]
