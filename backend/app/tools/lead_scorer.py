from app.models.schemas import CustomerProfile


SCORING_WEIGHTS = {
    "destination": 15,
    "passport": 15,
    "travel_month": 10,
    "travel_dates": 10,
    "travelers": 8,
    "purpose": 8,
    "visa_required": 10,
    "first_schengen": 5,
    "budget": 5,
    "customer_name": 4,
    "handoff_requested": 10,  # high intent signal
}


def calculate_lead_score(profile: CustomerProfile) -> int:
    score = 0

    if profile.destination:
        score += SCORING_WEIGHTS["destination"]
    if profile.passport:
        score += SCORING_WEIGHTS["passport"]
    if profile.travel_month:
        score += SCORING_WEIGHTS["travel_month"]
    if profile.travel_dates:
        score += SCORING_WEIGHTS["travel_dates"]
    if profile.travelers:
        score += SCORING_WEIGHTS["travelers"]
    if profile.purpose:
        score += SCORING_WEIGHTS["purpose"]
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


def get_missing_fields(profile: CustomerProfile) -> list[str]:
    missing = []
    if not profile.destination:
        missing.append("destination")
    if not profile.passport:
        missing.append("passport")
    if not profile.travel_month and not profile.travel_dates:
        missing.append("travel dates or month")
    if not profile.travelers:
        missing.append("number of travelers")
    if not profile.purpose:
        missing.append("purpose of travel")
    if profile.visa_required is None:
        missing.append("visa requirement")
    return missing


def get_next_priority_field(profile: CustomerProfile) -> str:
    """Returns the single most important missing field to ask about next."""
    if not profile.destination:
        return "destination"
    if not profile.passport:
        return "passport country"
    if not profile.purpose:
        return "purpose of travel"
    if not profile.travel_month and not profile.travel_dates:
        return "travel month or dates"
    if not profile.travelers:
        return "number of travelers"
    if profile.visa_required is None:
        return "whether they need a visa"
    if not profile.travel_dates:
        return "exact travel dates"
    if not profile.budget:
        return "approximate budget"
    return "any additional requirements"
