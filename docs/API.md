# Aria backend API (Gemini version)

The frontend and backend agree on exactly this. `CustomerProfile`, `DecisionEvent`, `HandoffCard` and `VisaInfo` keep the shapes in `frontend/src/lib/types.ts` / `backend/app/models/schemas.py`. The WebSocket (`/ws/{id}`) is removed; every update comes back in the HTTP response that caused it.

Common turn payload (`Turn`), returned by `/text`, `/audio` and `/tools`:

```jsonc
{
  "profile": CustomerProfile,
  "events": DecisionEvent[],         // new events from this request only
  "handoff": boolean,                // true only on the request that first triggers a handoff
  "handoff_card": HandoffCard | null,// present when handoff is true
  "visa": VisaInfo | null            // present once passport + destination are known
}
```

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | | `{status:"ok"}` (cheap; used to wake the server) |
| POST | `/api/sessions` | `{seed_profile?: Partial<CustomerProfile>, history?: {role, text}[]}` | `{session_id, greeting, profile}`. Seed fields rebuild a session lost on restart. |
| POST | `/api/sessions/{id}/text` | `{message}` (≤ 2000 chars), query `?tts=1` for audio | `Turn & {reply, audio_b64?: string}` (`audio_b64` = base64 MP3 of the whole reply) |
| POST | `/api/sessions/{id}/audio` | multipart `file` = WAV (16 kHz mono PCM16, ≤ 30 s) | `Turn & {user_transcript, reply, audio_b64}` (voice-lite fallback) |
| POST | `/api/sessions/{id}/live-token` | `{resume_handle?: string}` | `{token, model, voice, expires_at, api_version}`. 1-use ephemeral token for Gemini Live, config locked server-side. 429 when the per-session/IP cap is hit. |
| POST | `/api/sessions/{id}/tools` | `{calls: [{id, name, args}]}` | `Turn & {function_responses: [{id, name, response}]}`. The browser forwards `function_responses` to Gemini with `sendToolResponse`. |
| POST | `/api/sessions/{id}/transcript` | `{turns: [{role: "user"\|"assistant", text}]}` | `{ok: true}`. Live-mode turns, so the handoff summary and text mode share history. |
| GET | `/api/sessions/{id}/visa-info` | | `VisaInfo` (unchanged) |

Unknown session id → `404 {"detail":"Session not found"}`; the client recreates the session with `seed_profile` + `history` and retries once.

Rate limits (per IP, in-memory): sessions 30/min, text/audio 20/min, tools 120/min, transcript 60/min, live-token 6/min and at most 8 per session. 429 body: `{"detail":"busy"}`.

Live tools (declared in the token's locked config):
- `update_profile(destination?, passport?, travelers?, travel_month?, travel_dates?, purpose?, budget?, customer_name?, first_schengen?, confidence?)`: non-blocking, response scheduling SILENT.
- `lookup_visa(passport, destination)`: blocking; returns the verified KB record or `{found:false, instruction}`.
- `request_human_handoff(reason)`: non-blocking, scheduling WHEN_IDLE.

Models (env-overridable): `GEMINI_LIVE_MODEL=gemini-3.8-live`, `GEMINI_TEXT_MODEL=gemini-3.5-flash-lite`. Env: `GEMINI_API_KEY`, `ALLOWED_ORIGINS`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMIN_API_KEY`, optional `LIVE_VOICE`.
