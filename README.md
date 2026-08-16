# Travel Voice Concierge

A voice-powered AI travel assistant that has natural conversations with users and builds their profile in real time — destination, passport, travelers, intent, lead score — all visible on a live dashboard while they talk.

Built this because most travel inquiry flows feel like filling out a boring form. This one feels like talking to someone who actually knows what they're doing.

---

## What it does

You open the app, hit the mic button, and say something like:

> "Hey, I want to go to France in November with my girlfriend."

The AI responds naturally, asks smart follow-up questions, and — without the user knowing — the dashboard on the right is filling in:

- Destination → France
- Travelers → 2
- Month → November
- Passport → (still asking)
- Lead Score → climbing

Every field that gets filled, every question the agent decides to ask next, and every score change is logged to a visible **decision trace** — so nothing the AI does is a black box.

When the user says *"I want to talk to a real person"*, the system flags it immediately and shows a handoff card with everything collected so far, plus an AI-written summary for whoever picks up the conversation.

---

## Architecture

```
Browser (mic / text)
   │
   ├── POST /api/sessions/{id}/audio  ──►  Groq Whisper (STT)
   │        or /text                        │
   │                                         ▼
   │                                 ConversationManager
   │                                   │            │
   │                       extraction call      response call
   │                       (gpt-oss-120b,       (gpt-oss-120b,
   │                        temp 0.1, JSON)      temp 0.7, chat)
   │                             │                    │
   │                             ▼                    ▼
   │                     profile fields          reply text
   │                     + decision events            │
   │                                                   ▼
   │                                            Edge TTS (MP3)
   │                                                   │
   │  ◄── HTTP response (reply + audio, base64) ───────┘
   │
   └── WebSocket /ws/{id}  ◄── profile_update / decision_event /
                                transcript / handoff / status
```

Two channels do two different jobs:

- **REST** (`/api/sessions/{id}/audio` and `/text`) carries the actual conversational round-trip — it's what the mic button waits on for a reply.
- **WebSocket** (`/ws/{id}`) is a one-way push channel the backend uses to keep the dashboard (profile panel, lead score, decision trace, handoff card) in sync in real time, independent of whichever REST call is in flight. The frontend also reconnects it automatically with backoff if it drops.

**Every user turn costs two LLM calls, not one** — a low-temperature extraction pass that returns structured JSON (destination, passport, purpose, etc.) and a separate higher-temperature pass that generates the actual reply. They're split deliberately: mixing "return valid JSON" and "sound like a warm travel agent" in one prompt made the model waffle between modes. The trade-off is real — it roughly doubles time-to-first-token versus a single tool-calling pass. See [Known limitations](#known-limitations--what-id-change-for-production) for how I'd close that gap.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind |
| Backend | FastAPI + WebSockets |
| LLM | `openai/gpt-oss-120b` via Groq |
| Speech-to-Text | Groq Whisper (`whisper-large-v3-turbo`) |
| Text-to-Speech | Edge TTS (Microsoft, free) |
| Database | SQLite (schema present; sessions currently live in memory — see limitations) |
| Real-time | WebSockets |

Everything is free to run. No paid APIs required beyond Groq's free tier.

> The model was originally `llama-3.3-70b-versatile`; Groq deprecated it, so it's now on `openai/gpt-oss-120b`. Worth knowing if you're benchmarking against an older fork of this repo.

---

## Features

- **Voice conversation** — speak naturally, get a voice response back
- **Live customer profile** — extracts structured data as the conversation happens, one field at a time, never guessing
- **Lead scoring** — 0–100 score, weighted by field (destination/passport worth more than budget), updates in real time
- **Decision trace** — a timestamped log of every extraction, score change, and question decision, so you can see *why* the agent asked what it asked
- **Human handoff** — detects handoff intent, generates an AI summary of the conversation, and surfaces a full handoff card on the dashboard
- **Agentic questioning** — the agent picks the next question from what's actually missing (see `get_next_priority_field`), not a fixed script
- **Reconnecting WebSocket** — dashboard state survives a dropped connection without a page reload
- **Keyboard-accessible, responsive UI** — the voice orb is operable via Enter/Space (not just press-and-hold), layout collapses cleanly below 1024px, and focus states are visible for keyboard navigation

---

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── agent/          # conversation.py (orchestration), prompts.py, voice.py (STT/TTS)
│   │   ├── tools/          # lead_scorer.py, visa_knowledge.py
│   │   ├── models/         # schemas.py — Pydantic models for profile, events, session
│   │   └── api/            # routes.py (REST + WS), websocket_manager.py
│   ├── main.py
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js app router — page, layout, error/404 boundaries
│   │   ├── components/
│   │   │   ├── voice/       # VoiceOrb, Transcript
│   │   │   ├── dashboard/   # ProfilePanel, LeadScore, DecisionTrace, HandoffCard
│   │   │   └── CustomCursor.tsx
│   │   ├── hooks/           # useVoiceAgent.ts — WS lifecycle, mic capture, playback
│   │   └── lib/             # types.ts
│   └── package.json
│
└── .env.example
```

---

## Getting started

### 1. Clone the repo

```bash
git clone https://github.com/himavi/travel-voice-concierge.git
cd travel-voice-concierge
```

### 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Copy `.env.example` to `.env` and add your Groq API key:

```bash
cp .env.example .env
```

```env
GROQ_API_KEY=your_key_here
```

Get a free key at [console.groq.com](https://console.groq.com) — no credit card needed.

Start the backend:

```bash
python main.py
# or: uvicorn main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploying for free

Backend on Render, frontend on Vercel. Both have generous free tiers and auto-deploy on every push to `master`.

### 1. Backend → Render

1. In the Render dashboard: **New → Blueprint**, point it at this GitHub repo. It reads `render.yaml` at the repo root and pre-fills everything (root dir `backend`, build/start commands, `/health` check, free plan).
2. When prompted, set env vars:
   - `GROQ_API_KEY` — required
   - `ALLOWED_ORIGINS` — leave blank for now, you'll set it after the frontend is deployed
   - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — optional
3. Deploy and note the URL Render gives you, e.g. `https://travel-voice-concierge-backend.onrender.com`.

**About cold starts:** Render's free web services sleep after 15 minutes of no traffic; the next request then takes 30-60s to wake it, which is bad for a voice demo. Fix it with a free uptime pinger — [cron-job.org](https://cron-job.org) or UptimeRobot — hitting `https://<your-backend>.onrender.com/health` every 10 minutes. That keeps one service alive 24/7 and still fits inside Render's 750 free instance-hours/month.

### 2. Frontend → Vercel

1. Vercel dashboard → **New Project** → import the same repo.
2. Set **Root Directory** to `frontend`.
3. Add env vars:
   - `NEXT_PUBLIC_BACKEND_URL=https://<your-backend>.onrender.com`
   - `NEXT_PUBLIC_WS_URL=wss://<your-backend>.onrender.com`
4. Deploy — you get a free `*.vercel.app` URL on the Hobby plan.

### 3. Close the CORS loop

Back in Render → your service → Environment, set `ALLOWED_ORIGINS=https://<your-frontend>.vercel.app` and save (triggers a redeploy). Without this the backend rejects requests from the deployed frontend — `main.py` only allows `localhost` by default plus whatever's in `ALLOWED_ORIGINS`.

---

## How the agent works

Each turn runs through `ConversationManager.process_message`:

1. **Extract** — the raw user message goes to the LLM with `PROFILE_EXTRACTION_PROMPT` (temp 0.1, asked to return JSON or `{}`, told explicitly not to guess). Whatever comes back is diffed against the current profile — only *changed* fields become events and WebSocket pushes.
2. **Score** — `calculate_lead_score` re-sums a fixed weight table (destination/passport worth 15 each, budget worth 5, a handoff request alone is worth 10 as a strong intent signal) and emits a `LEAD_SCORE_UPDATED` event if it moved.
3. **Decide next question** — `get_next_priority_field` walks a fixed priority order (destination → passport → purpose → dates → travelers → visa requirement → budget) and returns the first thing still missing. This becomes the "Next Action" hint on the dashboard.
4. **Respond** — a second LLM call gets the full `SYSTEM_PROMPT` (persona + rules: one question at a time, under 3 sentences, never sound like a form) plus a compact one-line summary of the known profile plus the last 10 turns of history, and generates the reply.
5. **Synthesize** — the reply text goes to Edge TTS and comes back as MP3 bytes, base64-encoded straight into the HTTP response.

Every step that changes state — a field extracted, a score change, a question chosen, a handoff flagged — appends a `DecisionEvent`, which is what powers the decision trace panel. Nothing on that panel is decorative; it's a direct log of what `process_message` actually did.

---

## Design decisions

- **Two LLM calls instead of one function-calling pass.** Simpler prompts, easier to debug independently, and the extraction call can run at temp 0.1 for determinism while the reply call runs at 0.7 for warmth. Costs latency — see limitations.
- **WebSocket for dashboard state, REST for the conversational turn.** The mic button's request/response cycle shouldn't depend on a persistent connection staying open; the dashboard should update live regardless of which REST call is mid-flight. Splitting them meant neither has to compromise for the other.
- **Fixed-weight lead scoring over an LLM-judged score.** A rules-based score is auditable, deterministic, and free to compute on every turn. An LLM-judged "how hot is this lead" would be more nuanced but non-reproducible and slower — reasonable for a v2, not the first version.
- **In-memory session store.** Simplest thing that works for a demo; explicitly not what you'd ship (see below).

---

## Known limitations & what I'd change for production

Being upfront about this because it's more useful than pretending the demo is finished:

- **Sessions live in a process-local dict** (`sessions: Dict[str, ConversationManager]` in `routes.py`). Restart the backend and every active conversation is gone. There's a SQLAlchemy + SQLite dependency already in `requirements.txt` for this — wiring it up is the next step, not a redesign.
- **Two sequential LLM calls per turn** roughly doubles latency versus a single call with tool-calling/structured output support. Groq's models support function calling; collapsing extraction + response into one call with a `respond_to_user` tool schema is the obvious next optimization.
- **No streaming TTS to the client**, even though `synthesize_speech_streaming` already exists in `voice.py` — it's just not wired into the routes yet. The whole reply is synthesized before any audio reaches the browser, which is the single biggest latency win left on the table.
- **No retries or observability on the Groq calls.** Extraction failures are swallowed and silently return `{}`, which is the right *user-facing* behavior (never surface a malformed-JSON error to someone mid-conversation) but there's no logging behind it either, so a real failure looks identical to "nothing was mentioned."
- **No auth or rate limiting** on session creation — fine for a local demo, not fine for anything public.
- **No automated tests.** The conversation logic (extraction diffing, score calculation, next-field priority) is pure and easy to unit test; it just isn't yet.

---

## Groq free tier limits

- 14,400 requests/day for LLM
- 2 hours of audio/day for Whisper

More than enough for demos and early testing. If you're running this in production, you'd want to add a paid key.

---

## Roadmap

- [ ] Persistent sessions with the existing SQLAlchemy models
- [ ] Collapse extraction + response into a single tool-calling call
- [ ] Stream TTS audio instead of waiting for full synthesis
- [ ] Multi-language support
- [ ] CRM integration (HubSpot / Salesforce)
- [ ] Actual Atlys visa API integration
- [ ] Mobile app (React Native)

---

## License

MIT
