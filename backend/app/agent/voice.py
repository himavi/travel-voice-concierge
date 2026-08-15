"""
Voice handling: Groq Whisper for STT, Edge TTS for TTS.
"""

import os
import io
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
        text=text,
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
        text=text,
        voice=TTS_VOICE,
        rate=TTS_RATE,
        pitch=TTS_PITCH,
    )

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            yield chunk["data"]
