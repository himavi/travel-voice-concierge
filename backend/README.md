# Aria backend

FastAPI backend for Aria, a personal-project voice travel and visa concierge.

- **Live voice:** the browser talks to Gemini Live (`gemini-3.8-live`) directly, using a single-use ephemeral token minted by `POST /api/sessions/{id}/live-token`. The model, persona, tools and voice settings are locked inside the token. Tool calls come back to `POST /api/sessions/{id}/tools`.
- **Voice-lite and text fallback:** Gemini Flash-Lite (`gemini-3.5-flash-lite`). One call returns the transcript, the reply and the extracted trip details. Replies are spoken with edge-tts as one MP3.
- **Visa answers** come only from the curated knowledge base in `app/data/visa_knowledge.json`. Records last checked more than 6 months ago are flagged as unverified.
- **Sessions** are stored in Turso (hosted SQLite) when `ARIA_TURSO_URL`/`ARIA_TURSO_TOKEN` are set, so any Vercel instance can serve any request; otherwise in memory. Rate limits and analytics are per-instance in memory.

The API contract is in `docs/API.md` at the repo root. Live API details are in `LIVE_NOTES.md`.

## Environment

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Google AI Studio key |
| `ALLOWED_ORIGINS` | prod | comma-separated, e.g. the Vercel URL |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | no | hot-lead and handoff alerts |
| `ARIA_TURSO_URL`, `ARIA_TURSO_TOKEN` | prod | session storage (see root README) |
| `ADMIN_API_KEY` | no | enables `GET /api/admin/analytics` (`X-Admin-Key` header) |
| `GEMINI_TEXT_MODEL`, `GEMINI_LIVE_MODEL`, `LIVE_VOICE` | no | default `gemini-3.5-flash-lite`, `gemini-3.8-live`, `Aoede` |

Deployed on Vercel as a Python function (`main.py`, region `pdx1`, see `vercel.json`). If hosted on a platform that sleeps when idle (`SPACE_HOST` or `RENDER_EXTERNAL_URL` set), the app pings its own `/health` every 10 minutes. The `Dockerfile` runs it anywhere else on port 7860.

## Run locally

```bash
pip install -r requirements-dev.txt
GEMINI_API_KEY=... uvicorn main:app --port 8000
pytest
```
