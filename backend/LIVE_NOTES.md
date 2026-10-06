# Gemini Live: verified details (2026-10-06)

Everything below was observed on a real `gemini-3.8-live` session. The token was minted by this backend (`app/agent/live_session.py`) and used over the raw WebSocket, which is what the browser does.

## Token (`POST /api/sessions/{id}/live-token`)

Response:

```json
{"token": "auth_tokens/…", "model": "gemini-3.8-live", "voice": "Aoede",
 "expires_at": "…Z", "session_expires_at": "…Z", "api_version": "v1alpha"}
```

- **`api_version` must be `v1alpha`.** Token minting (`auth_tokens.create`) and the constrained Live endpoint only exist there.
- **`expires_at`** is the deadline to open the socket (2 min). Fetch the token right before connecting.
- **`session_expires_at`** is when the token expires (30 min).
- **Single use:** `uses: 1`. A reused token is closed with **1011 "Token has been used too many times"**. Use a new token for every connect or reconnect.
- **Everything is locked server-side:** model, system instruction (persona, current profile, last 12 turns), tools, voice, VAD, transcription, compression and resumption handle. Whatever the client puts in `setup` is ignored:
  - setup with a different model: the session still ran on the locked Live model;
  - setup with a pirate `systemInstruction`: the model still answered as Aria.
- **Python SDK names:** `CreateAuthTokenConfig(uses, expire_time, new_session_expire_time, live_connect_constraints=LiveConnectConstraints(model, config=LiveConnectConfig(...)))`. Leaving `lock_additional_fields` unset locks the whole config.

## Connecting from the browser (`@google/genai`)

```ts
const ai = new GoogleGenAI({ apiKey: token, httpOptions: { apiVersion: "v1alpha" } });
const session = await ai.live.connect({ model, config: { responseModalities: [Modality.AUDIO] }, callbacks });
```

- **Endpoint:** a token starting with `auth_tokens/` makes the SDK use `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=<token>`.
- **Setup:** the setup message only needs `{"setup": {"model": "models/gemini-3.8-live"}}`.
- **Mic audio:** `sendRealtimeInput({ audio: { data: <base64 PCM16 LE mono>, mimeType: "audio/pcm;rate=16000" } })`. Verified: 100 ms chunks, server VAD ends the turn after ~700 ms of silence.
- **Text input:** `sendRealtimeInput({ text })` works and triggers tool calls.
- **Resume:** send the latest `sessionResumptionUpdate.newHandle` to `/live-token` as `{resume_handle}`, then connect with the new token. Verified: a resumed session remembered the earlier conversation ("You mentioned … Japan").

## Server messages observed (wire JSON, camelCase)

| Message | Shape |
|---|---|
| first message | `{"setupComplete": {}}` |
| resumption | `{"sessionResumptionUpdate": {"newHandle": "<uuid>", "resumable": true}}`, seen right after connect; per the docs it is re-sent as the session goes on, so always keep the latest |
| VAD | `{"voiceActivity": {"type": "ACTIVITY_START", "audioOffset": "0.200s"}}` |
| user transcript | `{"serverContent": {"inputTranscription": {"text": "I want to go to Japan in December …"}}}` |
| Aria transcript | `{"serverContent": {"outputTranscription": {"text": " this December. To get"}}}`, arriving as fragments; concatenate them until `turnComplete` |
| audio | `{"serverContent": {"modelTurn": {"role": "model", "parts": [{"inlineData": {"mimeType": "audio/pcm;rate=24000", "data": "<base64 PCM16>"}}]}}}` |
| end of turn | `{"serverContent": {"generationComplete": true}}`, then `{"serverContent": {"turnComplete": true}, "usageMetadata": {...}}` |
| tool call | `{"toolCall": {"functionCalls": [{"id": "call_229188", "name": "update_profile", "args": {...}}, {"id": "fc_58…", "name": "lookup_visa", "args": {"destination": "Japan", "passport": "India"}}]}}` |
| empty | `{}` arrives often; ignore it |

- **Tool calls arrive in parallel:** `update_profile` and `lookup_visa` came in one `toolCall`.
- **Mixed id formats** (`call_…`, `fc_…`): echo them back unchanged.

**Not observed in these short tests:**
- `serverContent.interrupted` (barge-in)
- `goAway`
- `toolCallCancellation`

Handle them per the Live API docs: on `interrupted`, flush the player; on `goAway`, reconnect with a new token plus the resume handle.

## Tool loop

1. Forward `toolCall.functionCalls` unchanged: `POST /api/sessions/{id}/tools {"calls": [{id, name, args}]}`.
2. Send `function_responses` back as they are: `session.sendToolResponse({ functionResponses })`.
3. Apply `profile`, `events`, `visa` and `handoff_card` from the same response to the dashboard.

Wire form that was accepted:

```json
{"toolResponse": {"functionResponses": [
  {"id": "call_229188", "name": "update_profile",
   "response": {"ok": true, "known": "…", "still_unknown": ["purpose of travel"], "name": "…", "scheduling": "SILENT"},
   "scheduling": "SILENT"},
  {"id": "fc_58…", "name": "lookup_visa",
   "response": {"found": false, "passport": "India", "destination": "Japan", "instruction": "…"}}]}}
```

| Tool | `behavior` | Response `scheduling` |
|---|---|---|
| `update_profile` | `NON_BLOCKING` | `SILENT` |
| `lookup_visa` | `BLOCKING` | none |
| `request_human_handoff` | `NON_BLOCKING` | `WHEN_IDLE` |

`scheduling` is sent both inside `response` (the form the docs show) and on the FunctionResponse itself. The server accepted both. Which one it actually honors was not isolated.

After the tool response in the test above, the model said "I don't have verified visa details for Indian passport holders traveling to Japan… connect you with a visa specialist… What is the main purpose of your trip?"

## Greeting

`POST /api/sessions` stores the text greeting as Aria's first line. Until the user has said something, the Live system instruction contains no transcript, so Live greets in its own voice. After that, the last 12 turns are included and Live continues without greeting again.

Live only speaks after it gets input. To have Aria speak first, send a short text right after `setupComplete`, e.g. `sendRealtimeInput({ text: "Hi" })`. Verified: a text input gets a spoken reply, e.g. "I'm Aria, your friendly travel and visa concierge… Where are you thinking of going?"

## Usage (one turn, from `usageMetadata`)

| Turn | Prompt tokens | Response tokens | Thinking tokens |
|---|---|---|---|
| text turn | 3,863 (2,981 text) | 162 audio | 158 |
| 5 s audio turn | 4,104 (2,948 text, 658 audio) | 258 audio | 72 |
