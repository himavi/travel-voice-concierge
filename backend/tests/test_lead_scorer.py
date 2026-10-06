from app.agent.conversation import ConversationManager, asked_for_name
from app.models.schemas import CustomerProfile
from app.tools.lead_scorer import get_next_priority_field


def test_priority_order_name_last_and_once():
    p = CustomerProfile()
    order = []
    for field, value in [
        ("destination", "Japan"), ("passport", "India"), ("purpose", "tourism"),
        ("travel_month", "December"), ("travelers", 2),
    ]:
        order.append(get_next_priority_field(p, visa_checked=True))
        setattr(p, field, value)
    assert order == ["destination", "passport", "purpose of travel", "travel month or dates", "number of travelers"]
    assert get_next_priority_field(p, visa_checked=False) == "visa requirement"
    assert get_next_priority_field(p, visa_checked=True).startswith("their name")
    assert not get_next_priority_field(p, visa_checked=True, name_asked=True).startswith("their name")


def test_name_guidance_asks_at_most_once():
    conv = ConversationManager("n")
    assert conv.name_guidance() == "Don't ask for their name yet."
    conv.profile.destination, conv.profile.passport = "Japan", "India"
    assert "once" in conv.name_guidance()
    conv.add_transcript([{"role": "assistant", "text": "Lovely! And what's your name?"}])
    assert conv.name_asked is True
    assert "Never ask for it again" in conv.name_guidance()


def test_name_ask_detection():
    assert asked_for_name("May I know your name?")
    assert asked_for_name("What should I call you?")
    assert not asked_for_name("Which passport do you hold?")
