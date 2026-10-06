from app.models.schemas import CustomerProfile


# Weights sum to 100. The six core fields (destination, passport, purpose,
# month, travelers, visa need) add up to exactly LEAD_ALERT_THRESHOLD, so a
# fully-qualified trip is a hot lead even if the customer never gives a name.
SCORING_WEIGHTS = {
    "destination": 15,
    "passport": 15,
    "purpose": 10,
    "travel_month": 10,
    "travelers": 10,
    "visa_required": 10,
    "travel_dates": 5,
    "first_schengen": 5,
    "budget": 5,
    "customer_name": 5,
    "handoff_requested": 10,
}

LEAD_ALERT_THRESHOLD = 70  # score at which a hot-lead push notification fires


def calculate_lead_score(profile: CustomerProfile) -> int:
    score = 0
    if profile.destination:
        score += SCORING_WEIGHTS["destination"]
    if profile.passport:
        score += SCORING_WEIGHTS["passport"]
    if profile.purpose:
        score += SCORING_WEIGHTS["purpose"]
    # Month or exact dates both answer "when"; exact dates add a small bonus.
    if profile.travel_month or profile.travel_dates:
        score += SCORING_WEIGHTS["travel_month"]
    if profile.travel_dates:
        score += SCORING_WEIGHTS["travel_dates"]
    if profile.travelers:
        score += SCORING_WEIGHTS["travelers"]
    if profile.visa_required is not None:
        score += SCORING_WEIGHTS["visa_required"]
    if profile.first_schengen is not None:
        score += SCORING_WEIGHTS["first_schengen"]
    if profile.budget:
        score += SCORING_WEIGHTS["budget"]
    if profile.customer_name:
        score += SCORING_WEIGHTS["customer_name"]
    if profile.handoff_requested:
        score += SCORING_WEIGHTS["handoff_requested"]
    return min(score, 100)


def get_missing_fields(profile: CustomerProfile, *, visa_checked: bool = False) -> list[str]:
    """Core fields still unknown, in priority order. The name is optional and
    never counts as missing."""
    missing = []
    if not profile.destination:
        missing.append("destination")
    if not profile.passport:
        missing.append("passport")
    if not profile.purpose:
        missing.append("purpose of travel")
    if not profile.travel_month and not profile.travel_dates:
        missing.append("travel month or dates")
    if not profile.travelers:
        missing.append("number of travelers")
    if profile.visa_required is None and not visa_checked:
        missing.append("visa requirement")
    return missing


def get_next_priority_field(
    profile: CustomerProfile, *, name_asked: bool = False, visa_checked: bool = False,
) -> str:
    """The single most useful thing to learn next. Visa need is something
    Aria checks herself (lookup), not a question for the customer. The name
    comes last, only once, and only after destination + passport."""
    missing = get_missing_fields(profile, visa_checked=visa_checked)
    if missing:
        return missing[0]
    if not profile.customer_name and not name_asked:
        return "their name (optional, ask once)"
    return "nothing required; answer their questions and offer next steps"


def may_ask_name(profile: CustomerProfile, *, name_asked: bool) -> bool:
    return bool(profile.destination and profile.passport and not profile.customer_name and not name_asked)
