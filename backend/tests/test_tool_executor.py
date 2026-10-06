from app.agent.conversation import ConversationManager
from app.agent.tool_executor import execute_tool_calls
from app.tools.lead_scorer import LEAD_ALERT_THRESHOLD


def _types(outcome):
    return [e.event_type for e in outcome.events]


async def test_update_profile_moves_lead_score_and_emits_events():
    conv = ConversationManager("s1")
    assert conv.profile.lead_score == 0
    outcome, responses = await execute_tool_calls(conv, [
        {"id": "c1", "name": "update_profile", "args": {"destination": "France", "travelers": 2}},
    ])
    assert conv.profile.destination == "France"
    assert conv.profile.travelers == 2
    assert conv.profile.lead_score == 25
    types = _types(outcome)
    assert types.count("FIELD_EXTRACTED") == 2
    assert "LEAD_SCORE_UPDATED" in types
    assert "QUESTION_GENERATED" in types

    fr = responses[0]
    assert fr["id"] == "c1" and fr["name"] == "update_profile"
    assert "scheduling" not in fr and "scheduling" not in fr["response"]  # blocking tool
    assert fr["response"]["still_unknown"][0] == "passport"

    # Same values again: no new field events, score unchanged.
    outcome2, _ = await execute_tool_calls(conv, [
        {"id": "c2", "name": "update_profile", "args": {"destination": "France"}},
    ])
    assert "FIELD_EXTRACTED" not in _types(outcome2)
    assert conv.profile.lead_score == 25


async def test_lookup_visa_india_france_hits_kb():
    conv = ConversationManager("s2")
    outcome, responses = await execute_tool_calls(conv, [
        {"id": "v1", "name": "lookup_visa", "args": {"passport": "India", "destination": "France"}},
    ])
    resp = responses[0]["response"]
    assert resp["found"] is True
    assert resp["visa_required"] is True
    assert "Schengen" in resp["visa_type"]
    assert "fee" in resp and "processing_time" in resp
    assert isinstance(resp["verified"], bool)
    assert "scheduling" not in responses[0]  # blocking tool
    # Empty profile fields are filled from the lookup, and visa need recorded.
    assert conv.profile.passport == "India" and conv.profile.destination == "France"
    assert conv.profile.visa_required is True
    assert "VISA_CHECKED" in _types(outcome)


async def test_lookup_visa_city_resolves_via_geocoder():
    conv = ConversationManager("s2b")
    _, responses = await execute_tool_calls(conv, [
        {"id": "v1", "name": "lookup_visa", "args": {"passport": "Indian", "destination": "Paris"}},
    ])
    assert responses[0]["response"]["found"] is True


async def test_unknown_corridor_found_false():
    conv = ConversationManager("s3")
    _, responses = await execute_tool_calls(conv, [
        {"id": "v1", "name": "lookup_visa", "args": {"passport": "India", "destination": "Brazil"}},
    ])
    resp = responses[0]["response"]
    assert resp["found"] is False
    assert "specialist" in resp["instruction"]
    assert "fee" not in resp
    assert conv.profile.visa_required is None


async def test_ambiguous_destination_returns_candidates():
    conv = ConversationManager("s4")
    outcome, responses = await execute_tool_calls(conv, [
        {"id": "c1", "name": "update_profile", "args": {"destination": "Georgia", "passport": "India"}},
    ])
    assert conv.profile.pending_clarification["candidates"] == ["georgia", "usa"]
    assert "DESTINATION_CLARIFICATION_NEEDED" in _types(outcome)
    clar = responses[0]["response"]["clarify_destination"]
    assert clar["could_be"] == ["Georgia", "USA"]
    # No visa check while the destination is ambiguous.
    assert conv.visa_checked is False

    outcome2, responses2 = await execute_tool_calls(conv, [
        {"id": "c2", "name": "update_profile", "args": {"destination": "France"}},
    ])
    assert conv.profile.pending_clarification is None
    assert "clarify_destination" not in responses2[0]["response"]
    assert conv.profile.visa_required is True


async def test_handoff_tool_sets_flag_once():
    conv = ConversationManager("s5")
    outcome, responses = await execute_tool_calls(conv, [
        {"id": "h1", "name": "request_human_handoff", "args": {"reason": "wants a person"}},
    ])
    assert outcome.handoff is True and conv.profile.handoff_requested is True
    assert responses[0]["scheduling"] == "WHEN_IDLE"
    outcome2, _ = await execute_tool_calls(conv, [
        {"id": "h2", "name": "request_human_handoff", "args": {"reason": "again"}},
    ])
    assert outcome2.handoff is False


async def test_unknown_tool_and_bad_args_do_not_crash():
    conv = ConversationManager("s6")
    _, responses = await execute_tool_calls(conv, [
        {"id": "x", "name": "delete_everything", "args": {}},
        {"id": "y", "name": "update_profile", "args": {"travelers": "lots", "destination": ""}},
    ])
    assert "error" in responses[0]["response"]
    assert conv.profile.travelers is None and conv.profile.destination is None


async def test_core_fields_reach_hot_lead_without_name():
    conv = ConversationManager("s7")
    outcome, _ = await execute_tool_calls(conv, [{
        "id": "c", "name": "update_profile",
        "args": {"destination": "France", "passport": "India", "purpose": "tourism",
                 "travel_month": "May", "travelers": 2},
    }])
    assert conv.profile.visa_required is True
    assert conv.profile.lead_score >= LEAD_ALERT_THRESHOLD
    assert outcome.lead_alert is True
    assert outcome.profile_just_completed is True
