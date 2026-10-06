# Aria: AI travel & visa concierge

A voice AI agent that plans a trip with you in a natural conversation and builds your travel and visa profile live while you talk. Visa answers come only from a verified knowledge base, and it hands off to a human when you ask.

**Live demo:** https://travel-voice-concierge.vercel.app

Built because travel inquiry forms are tedious. Talking to someone who knows what they're doing isn't.

---

## What it does

Press **Talk to Aria** and say something like:

> "Hi, I want to go to Japan in December with my wife. We both have Indian passports."

Aria answers by voice in real time, and the dashboard fills in as you speak:

- **Travel profile:** destination, passport, dates, travelers, purpose, budget, plus a lead score.
- **Visa insight:** requirement, type, fee and processing time from a curated knowledge base with official sources and a "last verified" date. Aria never invents fees; for routes without verified data she says so and offers a specialist.
- **Decision trace:** every field extracted, tool called and score change, so nothing the agent does is a black box.
- **Human handoff:** say "can I talk to a real person?" and you get a handoff card with an AI-written summary (optionally pushed to Telegram).

You can interrupt Aria mid-sentence, switch to typing at any time, or skip voice entirely.

## Architecture

```
Browser ──(1) POST /api/sessions, /live-token ──► FastAPI (Vercel Python function)
   │                                              │  mints a single-use ephemeral token with
   │                                              │  model, persona, tools and voice locked in
   │
   ├──(2) WebSocket, 16 kHz PCM in / 24 kHz PCM out ──► Gemini Live (gemini-3.8-live)
   │        native speech-to-speech, VAD, barge-in, transcripts
   │
   └──(3) Gemini tool calls ──► POST /tools ──► profile update, lead score,
            update_profile                       verified visa lookup, handoff card
            lookup_visa                          │
            request_human_handoff                └─► session state in Turso (hosted SQLite)
```

- **Live mode (default):** the browser streams mic audio straight to Gemini Live using a short-lived token, so audio never passes through the backend. The token pins the model, system prompt and tools, so a client can't repurpose it.
- **Lite mode (automatic fallback):** if Live is unavailable (quota, unsupported browser), the browser records each utterance as WAV. One Gemini Flash-Lite call returns the transcript, reply and extracted fields, and edge-tts speaks the reply.
- **Text mode:** the same brain without a microphone.
- **Stateless API:** sessions are stored in Turso, so any serverless instance can serve any request. The browser sends one session's requests in order, and rebuilds a session that expired.

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14, Tailwind, AudioWorklet (PCM capture/resample), Web Audio playback |
| Voice AI | Gemini Live `gemini-3.8-live`, via `@google/genai` and ephemeral tokens |
| Fallback / text AI | Gemini `gemini-3.5-flash-lite` (structured JSON output), edge-tts |
| Backend | FastAPI on Vercel (Python), slowapi rate limits |
| State | Turso (hosted SQLite, HTTP API) |
| Alerts | Telegram bot (optional) |

Everything runs on free tiers: Vercel Hobby, Gemini API free tier, Turso free plan, edge-tts.

## Project structure

```
backend/
  main.py                    FastAPI app (Vercel entrypoint)
  app/agent/                 conversation manager, prompts, Gemini client, Live token + tools
  app/api/routes.py          API (see docs/API.md)
  app/core/session_store.py  Turso-backed sessions (in-memory locally)
  app/data/visa_knowledge.json  curated visa records with sources and verify dates
  tests/                     pytest suite
frontend/
  src/hooks/useLiveSession.ts   Gemini Live client (tokens, audio, tools, resumption)
  src/hooks/useVoiceAgent.ts    orchestrates Live → Lite → Text
  src/lib/audio/                AudioWorklet capture, PCM player, WAV encoder
docs/API.md                     frontend ↔ backend contract
```

## Run locally

```bash
# backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export GEMINI_API_KEY=...          # free key: https://aistudio.google.com/apikey
uvicorn main:app --reload --port 8000
pytest                             # 31 tests, no network needed

# frontend (new terminal)
cd frontend
npm install
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000 npm run dev
```

Without `ARIA_TURSO_URL`, sessions live in memory, which is fine for local use.

## Deploy (free)

Both apps are Vercel projects in this repo and redeploy on every push to `master`.

| Project | Root dir | Environment |
|---|---|---|
| Backend `travel-voice-concierge-api` | `backend` | `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, `ARIA_TURSO_URL`, `ARIA_TURSO_TOKEN`; optional `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMIN_API_KEY` |
| Frontend `travel-voice-concierge` | `frontend` | `NEXT_PUBLIC_BACKEND_URL`; optional `NEXT_PUBLIC_ENABLE_LIVE=false` to force Lite mode |

Turso setup: `turso db create aria`, then
`CREATE TABLE sessions (id TEXT PRIMARY KEY, state TEXT NOT NULL, updated_at INTEGER NOT NULL);`
and a token from `turso db tokens create aria`. The backend's Vercel region is pinned to `pdx1` (`backend/vercel.json`), next to the database.

## Design decisions

- **Speech-to-speech instead of STT → LLM → TTS.** One Live session gives lower latency, natural prosody and real barge-in. Profile extraction happens through tool calls the model makes while it talks, instead of a second LLM pass.
- **Ephemeral tokens instead of an audio proxy.** Audio goes browser ↔ Google directly. The backend only mints tokens and runs tools, which keeps it cheap enough to stay serverless.
- **Grounded visa facts.** Visa answers come only from `lookup_visa` and the knowledge base, each record with an official source URL and a verify date. Records older than 6 months are flagged as possibly outdated.
- **Answer first, one question at a time.** The agent answers what you asked before collecting details, never opens with "what's your name?", and asks for the name at most once.

## Limitations

- Free-tier quotas (Gemini, Vercel, Turso) cap concurrent use. When Live is unavailable the app falls back to Lite mode automatically.
- The visa knowledge base covers Indian passport holders to 9 destinations; other routes get a "no verified data, talk to a specialist" answer.
- Telegram alerts are best-effort.

## License

MIT
