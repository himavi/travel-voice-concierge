from datetime import date

from app.tools import knowledge_base as kb


async def test_ukraine_does_not_match_uk():
    assert await kb.lookup("India", "Ukraine") is None
    assert await kb.lookup("india", "ukrain") is None


async def test_uk_aliases_still_match():
    for name in ("UK", "United Kingdom", "England", "the U.K."):
        record = await kb.lookup("Indian", name)
        assert record is not None and record["destination_key"] == "uk", name


async def test_schengen_member_falls_back_to_schengen_record():
    record = await kb.lookup("India", "Switzerland")
    assert record is not None and record["destination_key"] == "schengen"
    # Cyprus is EU but not Schengen.
    assert await kb.lookup("India", "Cyprus") is None


async def test_unknown_passport_misses():
    assert await kb.lookup("Brazil", "France") is None


def test_stale_flag():
    assert kb.is_stale({"last_verified": "2025-06-01"}, today=date(2026, 10, 6)) is True
    assert kb.is_stale({"last_verified": "2026-09-01"}, today=date(2026, 10, 6)) is False
    assert kb.is_stale({}, today=date(2026, 10, 6)) is True


async def test_stale_record_is_flagged_for_the_model():
    from app.agent.conversation import ConversationManager
    from app.agent.tool_executor import execute_tool_calls

    conv = ConversationManager("kb")
    _, responses = await execute_tool_calls(conv, [
        {"id": "v", "name": "lookup_visa", "args": {"passport": "India", "destination": "France"}},
    ])
    resp = responses[0]["response"]
    record = await kb.lookup("India", "France")
    if kb.is_stale(record):
        assert resp["verified"] is False
        assert "may have changed" in resp["instruction"]
