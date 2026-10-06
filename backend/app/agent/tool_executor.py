"""
Executes Gemini Live tool calls that the browser forwards to
POST /api/sessions/{id}/tools, and builds the function responses the
browser sends back to Gemini with sendToolResponse.

All profile changes go through ConversationManager.apply_turn_outputs, the
same path text and voice-lite turns use.
"""

import logging
from typing import Any

from app.agent.conversation import ConversationManager, TurnOutcome, merge_outcomes
from app.agent.live_session import TOOL_SCHEDULING
from app.agent.prompts import (
    LOOKUP_FOUND_INSTRUCTION,
    LOOKUP_MISSING_INSTRUCTION,
    LOOKUP_UNVERIFIED_INSTRUCTION,
)
from app.tools.geo import display_country
from app.tools.knowledge_base import lookup as kb_lookup
from app.tools.lead_scorer import get_missing_fields
from app.tools.visa_knowledge import model_visa_payload

logger = logging.getLogger(__name__)

MAX_CALLS_PER_REQUEST = 8


def _function_response(call_id: str, name: str, response: dict) -> dict:
    scheduling = TOOL_SCHEDULING.get(name)
    if scheduling:
        # The Live API reads scheduling from inside `response` (per the docs);
        # it is mirrored on the FunctionResponse itself for SDKs that map it.
        response = {**response, "scheduling": scheduling}
    out: dict[str, Any] = {"id": call_id, "name": name, "response": response}
    if scheduling:
        out["scheduling"] = scheduling
    return out


def _progress(conv: ConversationManager) -> dict:
    p = conv.profile
    info: dict[str, Any] = {
        "ok": True,
        "known": conv.profile_summary(),
        "still_unknown": get_missing_fields(p, visa_checked=conv.visa_checked),
        "name": conv.name_guidance(),
    }
    if p.pending_clarification:
        info["clarify_destination"] = {
            "said": p.pending_clarification.get("raw"),
            "could_be": [display_country(c) for c in p.pending_clarification.get("candidates", [])],
            "instruction": "Ask which country they mean before anything else.",
        }
    return info


async def _update_profile(conv: ConversationManager, args: dict) -> tuple[TurnOutcome, dict]:
    outcome = await conv.apply_turn_outputs(args or {})
    return outcome, _progress(conv)


async def _lookup_visa(conv: ConversationManager, args: dict) -> tuple[TurnOutcome, dict]:
    passport = (args or {}).get("passport") or conv.profile.passport
    destination = (args or {}).get("destination") or conv.profile.destination
    # Fill the profile from the lookup only where it's still empty: the model
    # may be asking about a different country than the one in the profile.
    fill = {}
    if passport and not conv.profile.passport:
        fill["passport"] = passport
    if destination and not conv.profile.destination:
        fill["destination"] = destination
    outcome = await conv.apply_turn_outputs(fill) if fill else TurnOutcome()

    if not passport or not destination:
        return outcome, {
            "found": False,
            "instruction": "Ask for the missing passport country or destination, then look it up.",
        }
    record = await kb_lookup(passport, destination)
    payload = model_visa_payload(record)
    payload["passport"] = passport
    payload["destination"] = destination
    if record is None:
        payload["instruction"] = LOOKUP_MISSING_INSTRUCTION
    elif not payload["verified"]:
        payload["instruction"] = LOOKUP_UNVERIFIED_INSTRUCTION.format(last_verified=record.get("last_verified"))
    else:
        payload["instruction"] = LOOKUP_FOUND_INSTRUCTION
    return outcome, payload


async def _request_handoff(conv: ConversationManager, args: dict) -> tuple[TurnOutcome, dict]:
    reason = ((args or {}).get("reason") or "").strip()[:200] or "Customer asked to talk to a person"
    outcome = await conv.apply_turn_outputs({}, handoff_reason=reason)
    return outcome, {
        "ok": True,
        "status": "A visa specialist has been notified and has the conversation so far.",
        "instruction": "Tell the user warmly that a specialist will reach out shortly, then stay available for questions.",
    }


_HANDLERS = {
    "update_profile": _update_profile,
    "lookup_visa": _lookup_visa,
    "request_human_handoff": _request_handoff,
}


async def execute_tool_calls(conv: ConversationManager, calls: list[dict]) -> tuple[TurnOutcome, list[dict]]:
    outcome = TurnOutcome()
    responses: list[dict] = []
    for call in calls[:MAX_CALLS_PER_REQUEST]:
        call_id = str(call.get("id") or "")
        name = str(call.get("name") or "")
        args = call.get("args") if isinstance(call.get("args"), dict) else {}
        handler = _HANDLERS.get(name)
        if handler is None:
            responses.append({"id": call_id, "name": name, "response": {"error": f"Unknown tool {name}"}})
            continue
        try:
            step, response = await handler(conv, args)
        except Exception:
            logger.exception("Tool %s failed for session %s", name, conv.session_id)
            step, response = TurnOutcome(), {"error": "Tool failed; continue the conversation without it."}
        outcome = merge_outcomes(outcome, step)
        responses.append(_function_response(call_id, name, response))
    return outcome, responses
