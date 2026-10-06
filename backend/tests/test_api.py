import io
import wave

import asyncio
import pytest
from fastapi.testclient import TestClient

import main
from app.agent.conversation import ConversationManager
from app.agent.llm_schema import ProfileUpdates, TurnResult
from app.api import routes
from app.core.session_store import SessionStore, session_store


@pytest.fixture
def client(monkeypatch):
    sent = {"lead": [], "handoff": []}

    async def fake_lead(profile):
        sent["lead"].append(profile.session_id)

    async def fake_handoff(profile, card):
        sent["handoff"].append(profile.session_id)

    async def fake_card(self, reason=None):
        from app.models.schemas import HandoffCard
        p = self.profile
        return HandoffCard(customer_name=p.customer_name, destination=p.destination, passport=p.passport,
                           purpose=p.purpose, travel_month=p.travel_month, travelers=p.travelers,
                           lead_score=p.lead_score, reason=reason or "", conversation_summary="summary")

    monkeypatch.setattr(routes, "send_lead_alert", fake_lead)
    monkeypatch.setattr(routes, "send_handoff_alert", fake_handoff)
    monkeypatch.setattr(ConversationManager, "get_handoff_card", fake_card)
    with TestClient(main.app) as c:
        c.sent = sent
        yield c


def _new_session(client, **body):
    r = client.post("/api/sessions", json=body or None)
    assert r.status_code == 200, r.text
    return r.json()


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_create_session_shape_and_greeting(client):
    data = _new_session(client)
    assert set(data) == {"session_id", "greeting", "profile"}
    assert "name" not in data["greeting"].lower()
    conv = asyncio.run(session_store.get(data["session_id"]))
    assert conv.history[0].role == "assistant"


def test_seed_profile_rebuilds_session(client):
    data = _new_session(client, seed_profile={"destination": "France", "passport": "India", "travelers": 2,
                                              "lead_score": 99, "bogus": "x"},
                        history=[{"role": "user", "text": "France please"},
                                 {"role": "assistant", "text": "Great! What's your name?"}])
    prof = data["profile"]
    assert prof["destination"] == "France" and prof["travelers"] == 2
    assert prof["lead_score"] == 40  # recomputed, not trusted from the client
    conv = asyncio.run(session_store.get(data["session_id"]))
    assert conv.name_asked is True
    assert len(conv.history) == 2  # no greeting appended to a rebuilt session


def test_unknown_session_404(client):
    r = client.post("/api/sessions/nope/text", json={"message": "hi"})
    assert r.status_code == 404 and r.json() == {"detail": "Session not found"}


def test_hot_lead_alert_fires_once(client):
    sid = _new_session(client)["session_id"]
    calls = {"calls": [{"id": "1", "name": "update_profile", "args": {
        "destination": "France", "passport": "India", "purpose": "tourism", "travel_month": "May", "travelers": 2}}]}
    r = client.post(f"/api/sessions/{sid}/tools", json=calls)
    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) >= {"profile", "events", "handoff", "handoff_card", "visa", "function_responses"}
    assert body["profile"]["lead_score"] >= 70
    assert body["visa"]["available"] is True
    assert "LEAD_QUALIFIED" in [e["event_type"] for e in body["events"]]

    r2 = client.post(f"/api/sessions/{sid}/tools", json={"calls": [
        {"id": "2", "name": "update_profile", "args": {"budget": "3 lakh", "customer_name": "Priya"}}]})
    assert "LEAD_QUALIFIED" not in [e["event_type"] for e in r2.json()["events"]]
    assert client.sent["lead"] == [sid]


def test_handoff_via_tools_returns_card_once(client):
    sid = _new_session(client)["session_id"]
    call = {"calls": [{"id": "h", "name": "request_human_handoff", "args": {"reason": "asked for a person"}}]}
    body = client.post(f"/api/sessions/{sid}/tools", json=call).json()
    assert body["handoff"] is True and body["handoff_card"]["reason"] == "asked for a person"
    assert body["function_responses"][0]["scheduling"] == "WHEN_IDLE"
    body2 = client.post(f"/api/sessions/{sid}/tools", json=call).json()
    assert body2["handoff"] is False and body2["handoff_card"] is None
    assert client.sent["handoff"] == [sid]


def test_text_turn_uses_shared_path(client, monkeypatch):
    async def fake_generate(self, contents, *, audio):
        return TurnResult(reply="Japan in December sounds lovely! Which passport do you hold?",
                          profile_updates=ProfileUpdates(destination="Japan", travel_month="December"),
                          intent="trip_planning", reply_language="en"), 5.0, {}

    monkeypatch.setattr(ConversationManager, "_generate", fake_generate)
    sid = _new_session(client)["session_id"]
    body = client.post(f"/api/sessions/{sid}/text", json={"message": "Japan in December"}).json()
    assert body["reply"].startswith("Japan")
    assert body["profile"]["destination"] == "Japan"
    assert body["visa"] is None and body["handoff"] is False
    assert "audio_b64" not in body


def test_transcript_and_visa_info(client):
    sid = _new_session(client)["session_id"]
    r = client.post(f"/api/sessions/{sid}/transcript", json={"turns": [
        {"role": "user", "text": "Going to France"}, {"role": "assistant", "text": "Nice! What's your name?"}]})
    assert r.json() == {"ok": True}
    assert asyncio.run(session_store.get(sid)).name_asked is True
    assert client.get(f"/api/sessions/{sid}/visa-info").json() == {"available": False}


def test_audio_rejects_non_wav(client):
    sid = _new_session(client)["session_id"]
    r = client.post(f"/api/sessions/{sid}/audio", files={"file": ("a.webm", b"not a wav", "audio/webm")})
    assert r.status_code == 415


def test_audio_rejects_over_30s(client):
    sid = _new_session(client)["session_id"]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
        w.writeframes(b"\x00\x00" * 8000 * 32)
    r = client.post(f"/api/sessions/{sid}/audio", files={"file": ("a.wav", buf.getvalue(), "audio/wav")})
    assert r.status_code == 413


def test_live_token_per_session_cap(client, monkeypatch):
    async def fake_mint(conv, resume_handle=None):
        return {"token": "auth_tokens/x", "model": "m", "voice": "v", "expires_at": "t", "api_version": "v1alpha"}

    monkeypatch.setattr(routes, "mint_live_token", fake_mint)
    sid = _new_session(client)["session_id"]
    codes = []
    for i in range(6):
        codes.append(client.post(f"/api/sessions/{sid}/live-token", json={}).status_code)
    assert codes == [200] * 6
    r = client.post(f"/api/sessions/{sid}/live-token", json={})
    assert r.status_code == 429 and r.json() == {"detail": "busy"}  # 6/min per IP
    conv = asyncio.run(session_store.get(sid)); conv.live_tokens_issued = 8
    from app.core.rate_limit import limiter
    limiter.reset()
    r = client.post(f"/api/sessions/{sid}/live-token", json={"resume_handle": "h"})
    assert r.status_code == 429 and r.json() == {"detail": "busy"}  # 8 per session


def test_rate_limit_body(client):
    codes = [client.post("/api/sessions").status_code for _ in range(31)]
    assert codes[:30] == [200] * 30
    r = client.post("/api/sessions")
    assert r.status_code == 429 and r.json() == {"detail": "busy"}


def test_session_store_ttl_and_cap(monkeypatch):
    import app.core.session_store as ss
    now = [1000.0]
    monkeypatch.setattr(ss.time, "monotonic", lambda: now[0])
    store = SessionStore(ttl_seconds=60, max_sessions=2)
    run = asyncio.run
    run(store.create("a")); run(store.create("b"))
    now[0] += 30
    assert run(store.get("a")) is not None      # touch a: slides its TTL
    run(store.create("c"))                      # cap 2: evicts LRU (b)
    assert run(store.get("b")) is None and run(store.get("a")) is not None
    now[0] += 61
    assert run(store.get("a")) is None          # expired


def test_grounded_retry_when_corridor_completes_mid_turn(client, monkeypatch):
    calls = []

    async def fake_generate(self, contents, *, audio):
        state = await self.state_block()
        calls.append(state)
        if len(calls) == 1:  # ungrounded first try mentions visas
            return TurnResult(reply="Indians need a visa for Brazil.",
                              profile_updates=ProfileUpdates(passport="India")), 1.0, {}
        return TurnResult(reply="I don't have verified visa details for that route."), 1.0, {}

    monkeypatch.setattr(ConversationManager, "_generate", fake_generate)
    sid = _new_session(client, seed_profile={"destination": "Brazil"})["session_id"]
    body = client.post(f"/api/sessions/{sid}/text", json={"message": "Indian passports"}).json()
    assert len(calls) == 2
    assert "VISA DATA: none yet" in calls[0]
    assert "NO verified record" in calls[1]
    assert body["reply"].startswith("I don't have verified")
