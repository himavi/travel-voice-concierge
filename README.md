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

When the user says *"I want to talk to a real person"*, the system flags it immediately and shows a handoff card with everything collected so far.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 + Tailwind |
| Backend | FastAPI + WebSockets |
| LLM | Groq (llama-3.3-70b) |
| Speech-to-Text | Groq Whisper API |
| Text-to-Speech | Edge TTS (Microsoft, free) |
| Database | SQLite |
| Real-time | WebSockets |

Everything is free to run. No paid APIs required beyond Groq's free tier.

---

## Features

- **Voice conversation** — speak naturally, get a voice response back
- **Barge-in / interruption** — cut the AI off mid-sentence, it stops and listens
- **Live customer profile** — extracts structured data as the conversation happens
- **Lead scoring** — 0–100 score updates in real time based on what's been collected
- **Decision trace** — timeline showing what the AI detected and why it asked what it asked
- **Human handoff** — detects when user wants a human, shows full handoff card on dashboard
- **Agentic questioning** — AI decides what to ask next based on what's missing, not a fixed script

---

## Project structure

```
.
├── backend/
│   ├── app/
│   │   ├── agent/          # AI agent logic, prompts, conversation manager
│   │   ├── tools/          # Visa knowledge, lead scoring, calculator
│   │   ├── models/         # Pydantic schemas (profile, events, session)
│   │   └── api/            # FastAPI routes + WebSocket handlers
│   ├── main.py
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js app router pages
│   │   ├── components/
│   │   │   ├── voice/      # Mic button, waveform, conversation transcript
│   │   │   └── dashboard/  # Profile panel, lead score, decision trace, handoff
│   │   ├── hooks/          # useWebSocket, useVoice, useProfile
│   │   └── lib/            # WebSocket client, audio utils
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
uvicorn main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How the agent works

The AI isn't following a script. It gets a system prompt that tells it:

- What information it needs to collect (destination, passport, travelers, dates, purpose)
- To ask only one question at a time
- To sound like a helpful travel advisor, not a form

After each user message, it also runs a structured extraction pass to pull out any profile fields mentioned. Those go straight to the dashboard via WebSocket.

The lead score updates based on how many fields are filled and whether the user has shown buying intent.

---

## Groq free tier limits

- 14,400 requests/day for LLM
- 2 hours of audio/day for Whisper

More than enough for demos and early testing. If you're running this in production, you'd want to add a paid key.

---

## Roadmap

- [ ] Persistent sessions with PostgreSQL
- [ ] Multi-language support
- [ ] CRM integration (HubSpot / Salesforce)
- [ ] Actual Atlys visa API integration
- [ ] Mobile app (React Native)

---

## License

MIT
